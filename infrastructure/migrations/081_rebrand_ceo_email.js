/**
 * 081_rebrand_ceo_email
 *
 * Migration 047 seeded the dev-portal with the host app's identity:
 *   - CEO email ceo@enviree.de
 *   - AI agent emails *-agent@acca.internal
 *   - three baseline wiki pages whose content described the host
 *     accounting app (resolveOrgId, 4-layer org isolation, 9 RLS
 *     accounting tables, localhost:3000/4000, "ACCA development team")
 *
 * VibeStudio is now standalone, so this migration corrects that data
 * FORWARD (shipped migration 047 stays immutable per project rule).
 * All updates are idempotent — they only touch rows that still hold
 * the old values.
 */

const OLD_CEO = 'ceo@enviree.de';
const NEW_CEO = 'ceo@codes-ai.uk';

// AI agent emails: *-agent@acca.internal -> *-agent@codes-ai.uk
const AGENT_TYPES = ['coding', 'ops', 'qa', 'security', 'analytics', 'release'];

const WIKI_PAGES = [
  {
    slug: 'getting-started',
    content:
      '# Getting Started\n\nWelcome to the VibeStudio team!\n\n## Setup\n1. Clone the repo\n2. `cp .env.example .env` (fill DB password + JWT secrets + AI keys)\n3. `npm install`\n4. `node scripts/ensure-db-tunnel.js`\n5. `npm run db:migrate && npm run db:seed`\n6. `npm run dev`\n\n## Key URLs\n- Web: http://localhost:3100\n- API: http://localhost:4100\n- Dev Portal: http://localhost:3100/dev-portal',
  },
  {
    slug: 'conventions',
    content:
      '# Coding Conventions\n\n- DB columns: snake_case; all tables prefixed dev_*\n- TypeScript: camelCase\n- API responses: `{ success, data, error }`\n- Auth: dev_portal_token (never acca_token)\n- RLS: scripts SET LOCAL app.current_member_id\n- Mutations: logActivity() into dev_activity_log\n- Migrations: never edit a shipped one; add NNN_<slug>.js (next: 082)',
  },
  {
    slug: 'data-isolation',
    content:
      '# Access & Security\n\n## Auth — dev_portal_token (httpOnly cookie + Bearer fallback)\n## Roles — ceo / lead / product_owner + AI agent roles (agent_*)\n## Database — PostgreSQL RLS on dev_* tables (SET LOCAL app.current_member_id)\n## Audit — logActivity() records every mutation',
  },
];

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('dev_team_members')) {
    await knex('dev_team_members').where({ email: OLD_CEO }).update({ email: NEW_CEO });
    for (const t of AGENT_TYPES) {
      await knex('dev_team_members')
        .where({ email: `${t}-agent@acca.internal` })
        .update({ email: `${t}-agent@codes-ai.uk` });
    }
  }

  if (await knex.schema.hasTable('dev_wiki_pages')) {
    for (const wp of WIKI_PAGES) {
      await knex('dev_wiki_pages').where({ slug: wp.slug }).update({ content: wp.content });
    }
  }
};

exports.down = async function down(knex) {
  // Email rebrand is reversible; wiki content is left as-is (forward-only
  // correction — the original host-app content is not restored).
  if (await knex.schema.hasTable('dev_team_members')) {
    await knex('dev_team_members').where({ email: NEW_CEO }).update({ email: OLD_CEO });
    for (const t of AGENT_TYPES) {
      await knex('dev_team_members')
        .where({ email: `${t}-agent@codes-ai.uk` })
        .update({ email: `${t}-agent@acca.internal` });
    }
  }
};
