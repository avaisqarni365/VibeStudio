/**
 * Mobile Deployment Service
 * Credential encryption, EAS Build/Submit/Update orchestration
 */
import { createLogger } from '@vibestudio/logging';

const logger = createLogger({ service: 'mobile-deploy' });

// ── Encryption (AES-256-GCM) ──
function getEncryptionKey(): Buffer {
  const crypto = require('crypto');
  const secret = process.env.MOBILE_DEPLOY_KEY || process.env.JWT_SECRET || 'acca-mobile-deploy-default-key';
  return crypto.scryptSync(secret, 'acca-mobile-salt', 32);
}

function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const crypto = require('crypto');
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const crypto = require('crypto');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export const mobileDeployService = {

  // ── Credentials CRUD ──

  async listCredentials() {
    const { db } = require('@vibestudio/database');
    const rows = await db('dev_mobile_credentials')
      .leftJoin('dev_team_members', 'dev_mobile_credentials.member_id', 'dev_team_members.id')
      .select('dev_mobile_credentials.*', 'dev_team_members.name as member_name', 'dev_team_members.display_name as member_display_name')
      .orderBy('platform').orderBy('credential_type');
    // Strip encrypted values — only return metadata
    return rows.map((r: any) => ({
      id: r.id, platform: r.platform, credential_type: r.credential_type,
      credential_name: r.credential_name, metadata: r.metadata,
      is_active: r.is_active, last_verified_at: r.last_verified_at,
      member_name: r.member_display_name || r.member_name,
      created_at: r.created_at, updated_at: r.updated_at,
      // Show masked preview (last 4 chars)
      preview: (() => { try { const v = decrypt(r.encrypted_value, r.iv, r.auth_tag); return v.length > 4 ? '••••' + v.slice(-4) : '••••'; } catch { return '••••'; } })(),
    }));
  },

  async createCredential(memberId: string, data: { platform: string; credential_type: string; credential_name: string; value: string; metadata?: any }) {
    const { db } = require('@vibestudio/database');
    const { encrypted, iv, authTag } = encrypt(data.value);
    const [row] = await db('dev_mobile_credentials').insert({
      member_id: memberId, platform: data.platform, credential_type: data.credential_type,
      credential_name: data.credential_name, encrypted_value: encrypted, iv, auth_tag: authTag,
      metadata: JSON.stringify(data.metadata || {}),
    }).returning('*');
    return { id: row.id, platform: row.platform, credential_type: row.credential_type, credential_name: row.credential_name };
  },

  async updateCredential(credId: string, data: { credential_name?: string; value?: string; metadata?: any; is_active?: boolean }) {
    const { db } = require('@vibestudio/database');
    const updates: any = { updated_at: new Date() };
    if (data.credential_name) updates.credential_name = data.credential_name;
    if (data.is_active !== undefined) updates.is_active = data.is_active;
    if (data.metadata) updates.metadata = JSON.stringify(data.metadata);
    if (data.value) {
      const { encrypted, iv, authTag } = encrypt(data.value);
      updates.encrypted_value = encrypted;
      updates.iv = iv;
      updates.auth_tag = authTag;
    }
    await db('dev_mobile_credentials').where('id', credId).update(updates);
    return { updated: true };
  },

  async deleteCredential(credId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_mobile_credentials').where('id', credId).del();
    return { deleted: true };
  },

  async getDecryptedCredential(credType: string, platform?: string): Promise<string | null> {
    const { db } = require('@vibestudio/database');
    let q = db('dev_mobile_credentials').where('credential_type', credType).where('is_active', true);
    if (platform) q = q.where('platform', platform);
    const row = await q.first();
    if (!row) return null;
    try { return decrypt(row.encrypted_value, row.iv, row.auth_tag); } catch { return null; }
  },

  // ── Build Operations ──

  async triggerBuild(memberId: string, data: { platform: string; profile: string; version?: string; buildNumber?: number }) {
    const { db } = require('@vibestudio/database');
    const fs = require('fs');
    const path = require('path');

    // Read current app config
    const root = getProjectRoot();
    const appJsonPath = path.join(root, 'apps/mobile/app.json');
    let appConfig: any = {};
    try { appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8')); } catch {}

    // Create build record
    const [build] = await db('dev_mobile_builds').insert({
      member_id: memberId,
      platform: data.platform,
      profile: data.profile,
      build_type: 'eas_build',
      version: data.version || appConfig?.expo?.version || '1.0.0',
      build_number: data.buildNumber || null,
      status: 'queued',
      config_snapshot: JSON.stringify({ app: appConfig, profile: data.profile }),
      started_at: new Date(),
    }).returning('*');

    // Execute EAS build in background
    this._runEasBuild(build.id, data.platform, data.profile).catch(err => {
      logger.error('EAS build failed', err);
    });

    return build;
  },

  async _runEasBuild(buildId: string, platform: string, profile: string) {
    const { db } = require('@vibestudio/database');
    const { execSync } = require('child_process');
    const path = require('path');
    const root = getProjectRoot();
    const mobileDir = path.join(root, 'apps/mobile');

    try {
      await db('dev_mobile_builds').where('id', buildId).update({ status: 'building', status_detail: 'Running eas build...' });

      // Get Expo token
      const expoToken = await this.getDecryptedCredential('expo_token');
      const env: any = { ...process.env, PATH: process.env.PATH };
      if (expoToken) env.EXPO_TOKEN = expoToken;

      const platforms = platform === 'both' ? ['ios', 'android'] : [platform];
      let fullLog = '';

      for (const p of platforms) {
        const cmd = `npx eas-cli build --platform ${p} --profile ${profile} --non-interactive --json 2>&1`;
        try {
          const output = execSync(cmd, { cwd: mobileDir, env, timeout: 600_000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
          fullLog += `\n=== ${p.toUpperCase()} BUILD ===\n${output}\n`;

          // Parse EAS build ID from JSON output
          try {
            const parsed = JSON.parse(output);
            if (parsed?.[0]?.id) {
              await db('dev_mobile_builds').where('id', buildId).update({ eas_build_id: parsed[0].id, status_detail: `EAS Build ID: ${parsed[0].id}` });
            }
          } catch {}
        } catch (e: any) {
          fullLog += `\n=== ${p.toUpperCase()} BUILD ERROR ===\n${e.stdout || e.stderr || e.message}\n`;
          throw e;
        }
      }

      await db('dev_mobile_builds').where('id', buildId).update({
        status: 'built', log_output: fullLog, completed_at: new Date(),
        duration_seconds: Math.round((Date.now() - new Date((await db('dev_mobile_builds').where('id', buildId).first()).started_at).getTime()) / 1000),
      });
    } catch (err: any) {
      await db('dev_mobile_builds').where('id', buildId).update({
        status: 'failed', error_message: err.message || 'Build failed',
        log_output: err.stdout || err.stderr || err.message, completed_at: new Date(),
      });
    }
  },

  async listBuilds(filters?: { platform?: string; status?: string; limit?: number }) {
    const { db } = require('@vibestudio/database');
    let q = db('dev_mobile_builds')
      .leftJoin('dev_team_members', 'dev_mobile_builds.member_id', 'dev_team_members.id')
      .select('dev_mobile_builds.*', 'dev_team_members.name as member_name', 'dev_team_members.display_name as member_display_name')
      .orderBy('dev_mobile_builds.created_at', 'desc');
    if (filters?.platform) q = q.where('dev_mobile_builds.platform', filters.platform);
    if (filters?.status) q = q.where('dev_mobile_builds.status', filters.status);
    return q.limit(filters?.limit || 50);
  },

  async getBuild(buildId: string) {
    const { db } = require('@vibestudio/database');
    return db('dev_mobile_builds').where('id', buildId).first();
  },

  async cancelBuild(buildId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_mobile_builds').where('id', buildId).update({ status: 'cancelled', completed_at: new Date() });
    return { cancelled: true };
  },

  async submitToStore(buildId: string, memberId: string) {
    const { db } = require('@vibestudio/database');
    const build = await db('dev_mobile_builds').where('id', buildId).first();
    if (!build || build.status !== 'built') throw new Error('Build not ready for submission');

    await db('dev_mobile_builds').where('id', buildId).update({ status: 'submitting', status_detail: 'Submitting to store...' });

    // Run in background
    this._runEasSubmit(buildId, build.platform).catch(err => logger.error('EAS submit failed', err));
    return { submitting: true };
  },

  async _runEasSubmit(buildId: string, platform: string) {
    const { db } = require('@vibestudio/database');
    const { execSync } = require('child_process');
    const path = require('path');
    const root = getProjectRoot();
    const mobileDir = path.join(root, 'apps/mobile');

    try {
      const expoToken = await this.getDecryptedCredential('expo_token');
      const env: any = { ...process.env };
      if (expoToken) env.EXPO_TOKEN = expoToken;

      // Inject Apple/Google credentials as env vars
      const appleKeyId = await this.getDecryptedCredential('apple_api_key_id', 'ios');
      const appleIssuerId = await this.getDecryptedCredential('apple_api_key_issuer', 'ios');
      const googleSa = await this.getDecryptedCredential('google_service_account', 'android');

      if (appleKeyId) env.APPLE_API_KEY_ID = appleKeyId;
      if (appleIssuerId) env.APPLE_API_KEY_ISSUER_ID = appleIssuerId;

      // Write temp Google SA file if needed
      let tmpSaPath = '';
      if (googleSa && (platform === 'android' || platform === 'both')) {
        const os = require('os');
        tmpSaPath = path.join(os.tmpdir(), `acca-gsa-${Date.now()}.json`);
        require('fs').writeFileSync(tmpSaPath, googleSa);
        env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE_PATH = tmpSaPath;
      }

      const platforms = platform === 'both' ? ['ios', 'android'] : [platform];
      let log = '';

      for (const p of platforms) {
        const cmd = `npx eas-cli submit --platform ${p} --latest --non-interactive 2>&1`;
        try {
          const output = execSync(cmd, { cwd: mobileDir, env, timeout: 300_000, encoding: 'utf-8' });
          log += `\n=== ${p.toUpperCase()} SUBMIT ===\n${output}\n`;
        } catch (e: any) {
          log += `\n=== ${p.toUpperCase()} SUBMIT ERROR ===\n${e.stdout || e.stderr || e.message}\n`;
          throw e;
        }
      }

      // Cleanup temp file
      if (tmpSaPath) try { require('fs').unlinkSync(tmpSaPath); } catch {}

      await db('dev_mobile_builds').where('id', buildId).update({ status: 'submitted', log_output: db.raw("COALESCE(log_output,'') || ?", [log]), completed_at: new Date() });
    } catch (err: any) {
      await db('dev_mobile_builds').where('id', buildId).update({ status: 'failed', error_message: err.message });
    }
  },

  // ── OTA Updates ──

  async publishOtaUpdate(memberId: string, data: { channel: string; platform: string; message: string }) {
    const { db } = require('@vibestudio/database');
    const [update] = await db('dev_mobile_ota_updates').insert({
      member_id: memberId, channel: data.channel, platform: data.platform,
      message: data.message, status: 'publishing',
    }).returning('*');

    // Run in background
    this._runEasUpdate(update.id, data.channel, data.message, data.platform).catch(err => logger.error('OTA update failed', err));
    return update;
  },

  async _runEasUpdate(updateId: string, channel: string, message: string, platform: string) {
    const { db } = require('@vibestudio/database');
    const { execSync } = require('child_process');
    const path = require('path');
    const root = getProjectRoot();
    const mobileDir = path.join(root, 'apps/mobile');

    try {
      const expoToken = await this.getDecryptedCredential('expo_token');
      const env: any = { ...process.env };
      if (expoToken) env.EXPO_TOKEN = expoToken;

      const platFlag = platform !== 'all' ? ` --platform ${platform}` : '';
      const cmd = `npx eas-cli update --channel ${channel} --message "${message.replace(/"/g, '\\"')}"${platFlag} --non-interactive 2>&1`;
      const output = execSync(cmd, { cwd: mobileDir, env, timeout: 300_000, encoding: 'utf-8' });

      await db('dev_mobile_ota_updates').where('id', updateId).update({ status: 'published', log_output: output });
    } catch (err: any) {
      await db('dev_mobile_ota_updates').where('id', updateId).update({ status: 'failed', log_output: err.stdout || err.stderr || err.message });
    }
  },

  async listOtaUpdates(limit = 30) {
    const { db } = require('@vibestudio/database');
    return db('dev_mobile_ota_updates')
      .leftJoin('dev_team_members', 'dev_mobile_ota_updates.member_id', 'dev_team_members.id')
      .select('dev_mobile_ota_updates.*', 'dev_team_members.name as member_name', 'dev_team_members.display_name as member_display_name')
      .orderBy('dev_mobile_ota_updates.created_at', 'desc').limit(limit);
  },

  async rollbackOta(updateId: string) {
    const { db } = require('@vibestudio/database');
    await db('dev_mobile_ota_updates').where('id', updateId).update({ status: 'rolled_back' });
    return { rolled_back: true };
  },

  // ── Config ──

  async getAppConfig() {
    const fs = require('fs');
    const path = require('path');
    const root = getProjectRoot();
    const appJson = path.join(root, 'apps/mobile/app.json');
    const easJson = path.join(root, 'apps/mobile/eas.json');
    let app: any = {}, eas: any = {};
    try { app = JSON.parse(fs.readFileSync(appJson, 'utf-8')); } catch {}
    try { eas = JSON.parse(fs.readFileSync(easJson, 'utf-8')); } catch {}
    return { app, eas, version: app?.expo?.version || '1.0.0', name: app?.expo?.name || 'ACCA Mobile' };
  },

  async updateAppVersion(version: string, buildNumber?: number) {
    const fs = require('fs');
    const path = require('path');
    const root = getProjectRoot();
    const appJsonPath = path.join(root, 'apps/mobile/app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    if (version) appJson.expo.version = version;
    if (buildNumber !== undefined) {
      if (appJson.expo.ios) appJson.expo.ios.buildNumber = String(buildNumber);
      if (appJson.expo.android) appJson.expo.android.versionCode = buildNumber;
    }
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
    return { version: appJson.expo.version };
  },
};

// Reuse the project root finder
function getProjectRoot(): string {
  const fs = require('fs');
  const path = require('path');
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      if (pkg.workspaces || fs.existsSync(path.join(dir, 'turbo.json'))) return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
