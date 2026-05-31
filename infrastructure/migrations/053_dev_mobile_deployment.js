/**
 * Migration 053: Mobile App Deployment Pipeline
 * Credentials (encrypted), builds, OTA updates
 */
exports.up = async function(knex) {
  // Encrypted store credentials (Apple / Google / Expo / Keystore)
  await knex.schema.createTable('dev_mobile_credentials', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    t.text('platform').notNullable();         // ios, android, expo
    t.text('credential_type').notNullable();   // apple_id, apple_team_id, asc_app_id, apple_api_key_id, apple_api_key_issuer, apple_api_key_p8, google_service_account, android_keystore, android_keystore_alias, android_keystore_password, expo_token
    t.text('credential_name').notNullable();   // human label
    t.text('encrypted_value').notNullable();   // AES-256-GCM
    t.text('iv').notNullable();
    t.text('auth_tag').notNullable();
    t.jsonb('metadata').defaultTo('{}');       // non-secret: expiry, key ID, etc.
    t.boolean('is_active').defaultTo(true);
    t.timestamp('last_verified_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Build history & status
  await knex.schema.createTable('dev_mobile_builds', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    t.text('platform').notNullable();          // ios, android, both
    t.text('profile').notNullable();           // development, preview, production
    t.text('build_type').notNullable();        // eas_build, eas_submit, eas_update
    t.text('version').nullable();
    t.integer('build_number').nullable();
    t.text('eas_build_id').nullable();
    t.text('status').notNullable().defaultTo('queued'); // queued, building, built, submitting, submitted, published, failed, cancelled
    t.text('status_detail').nullable();
    t.text('artifact_url').nullable();
    t.text('store_url').nullable();
    t.text('log_output').nullable();
    t.jsonb('config_snapshot').defaultTo('{}');
    t.integer('duration_seconds').nullable();
    t.text('error_message').nullable();
    t.timestamp('started_at').nullable();
    t.timestamp('completed_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // OTA updates
  await knex.schema.createTable('dev_mobile_ota_updates', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('member_id').notNullable().references('id').inTable('dev_team_members').onDelete('CASCADE');
    t.text('update_group_id').nullable();
    t.text('channel').notNullable();           // production, preview, development
    t.text('platform').notNullable().defaultTo('all'); // ios, android, all
    t.text('runtime_version').nullable();
    t.text('message').nullable();
    t.text('status').notNullable().defaultTo('publishing'); // publishing, published, rolled_back, failed
    t.text('log_output').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.raw('CREATE INDEX idx_mobile_cred_platform ON dev_mobile_credentials (platform)');
  await knex.schema.raw('CREATE INDEX idx_mobile_builds_status ON dev_mobile_builds (status)');
  await knex.schema.raw('CREATE INDEX idx_mobile_builds_member ON dev_mobile_builds (member_id)');
  await knex.schema.raw('CREATE INDEX idx_mobile_builds_created ON dev_mobile_builds (created_at DESC)');
  await knex.schema.raw('CREATE INDEX idx_mobile_ota_channel ON dev_mobile_ota_updates (channel)');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dev_mobile_ota_updates');
  await knex.schema.dropTableIfExists('dev_mobile_builds');
  await knex.schema.dropTableIfExists('dev_mobile_credentials');
};
