"use strict";
// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotifyTrigger = exports.getNotifyTriggers = exports.dropNotifyTrigger = exports.createSendNotificationTriggerFunction = exports.createUniqueIndexQuery = exports.createExcludeConstraintQuery = exports.BTREE_GIST_EXTENSION_EXIST_QUERY = exports.addTagsToForeignKeyMap = exports.commentTableQuery = exports.commentConstraintQuery = exports.getUniqConstraint = exports.getFkConstraint = exports.getVirtualFkTag = exports.smartTags = void 0;
const utils_1 = require("sequelize/lib/utils");
const tagOrder = {
    foreignKey: 0,
    foreignFieldName: 1,
    singleForeignFieldName: 2,
};
const byTagOrder = (a, b) => {
    return tagOrder[a[0]] - tagOrder[b[0]];
};
function smartTags(tags, separator = '\n') {
    return Object.entries(tags)
        .sort(byTagOrder)
        .map(([k, v]) => `@${k} ${v}`)
        .join(separator);
}
exports.smartTags = smartTags;
function getVirtualFkTag(field, to) {
    return `(${underscored(field)}) REFERENCES ${to} (id)`;
}
exports.getVirtualFkTag = getVirtualFkTag;
const underscored = (input) => (0, utils_1.underscoredIf)(input, true);
function getFkConstraint(tableName, foreignKey) {
    return [tableName, foreignKey, 'fkey'].map(underscored).join('_');
}
exports.getFkConstraint = getFkConstraint;
function getUniqConstraint(tableName, field) {
    return [tableName, field, 'uindex'].map(underscored).join('_');
}
exports.getUniqConstraint = getUniqConstraint;
function getExcludeConstraint(tableName) {
    return [tableName, '_id', '_block_range', 'exclude']
        .map(underscored)
        .join('_');
}
function commentConstraintQuery(table, constraint, comment) {
    return `COMMENT ON CONSTRAINT ${constraint} ON ${table} IS E'${comment}'`;
}
exports.commentConstraintQuery = commentConstraintQuery;
function commentTableQuery(column, comment) {
    return `COMMENT ON TABLE ${column} IS E'${comment}'`;
}
exports.commentTableQuery = commentTableQuery;
function addTagsToForeignKeyMap(map, tableName, foreignKey, newTags) {
    if (!map.has(tableName)) {
        map.set(tableName, new Map());
    }
    const tableKeys = map.get(tableName);
    let foreignKeyTags = tableKeys.get(foreignKey) || {};
    foreignKeyTags = Object.assign(foreignKeyTags, newTags);
    tableKeys.set(foreignKey, foreignKeyTags);
}
exports.addTagsToForeignKeyMap = addTagsToForeignKeyMap;
exports.BTREE_GIST_EXTENSION_EXIST_QUERY = `SELECT * FROM pg_extension where extname = 'btree_gist'`;
function createExcludeConstraintQuery(schema, table) {
    const constraint = getExcludeConstraint(table);
    return `DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
        ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT ${constraint} EXCLUDE USING gist (id WITH =, _block_range WITH &&);
      END IF;
    END;
    $$`;
}
exports.createExcludeConstraintQuery = createExcludeConstraintQuery;
function createUniqueIndexQuery(schema, table, field) {
    return `create unique index if not exists '${getUniqConstraint(table, field)}' on '${schema}.${table}' (${underscored(field)})`;
}
exports.createUniqueIndexQuery = createUniqueIndexQuery;
exports.createSendNotificationTriggerFunction = `
CREATE OR REPLACE FUNCTION send_notification()
    RETURNS trigger AS $$
DECLARE
    row RECORD;
    payload JSONB;
BEGIN
    IF (TG_OP = 'DELETE') THEN
      row = OLD;
    ELSE
      row = NEW;
    END IF;
    payload = jsonb_build_object(
      'id', row.id,
      'mutation_type', TG_OP,
      '_entity', row);
    IF payload -> '_entity' ? '_block_range' THEN
      IF NOT upper_inf(row._block_range) THEN
        RETURN NULL;
      END IF;
      payload = payload || '{"mutation_type": "UPDATE"}';
      payload = payload #- '{"_entity","_id"}';
      payload = payload #- '{"_entity","_block_range"}';
    END IF;
    IF (octet_length(payload::text) >= 8000) THEN
      payload = payload || '{"_entity": null}';
    END IF;
    PERFORM pg_notify(
      CONCAT(TG_TABLE_SCHEMA, '.', TG_TABLE_NAME),
      payload::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;`;
function dropNotifyTrigger(schema, table) {
    return `DROP TRIGGER IF EXISTS "${schema}_${table}_notify_trigger"
    ON "${schema}"."${table}";`;
}
exports.dropNotifyTrigger = dropNotifyTrigger;
function getNotifyTriggers() {
    return `select trigger_name as "triggerName", event_manipulation as "eventManipulation" from information_schema.triggers
          WHERE trigger_name = :triggerName`;
}
exports.getNotifyTriggers = getNotifyTriggers;
function createNotifyTrigger(schema, table) {
    return `
CREATE TRIGGER "${schema}_${table}_notify_trigger"
    AFTER INSERT OR UPDATE OR DELETE
    ON "${schema}"."${table}"
    FOR EACH ROW EXECUTE FUNCTION send_notification();`;
}
exports.createNotifyTrigger = createNotifyTrigger;
//# sourceMappingURL=sync-helper.js.map