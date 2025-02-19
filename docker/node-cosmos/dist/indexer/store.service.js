"use strict";
// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreService = void 0;
const assert_1 = __importDefault(require("assert"));
const common_1 = require("@nestjs/common");
const util_1 = require("@polkadot/util");
const util_crypto_1 = require("@polkadot/util-crypto");
const utils_1 = require("@subql/utils");
const lodash_1 = require("lodash");
const sequelize_1 = require("sequelize");
const NodeConfig_1 = require("../configure/NodeConfig");
const graphql_1 = require("../utils/graphql");
const logger_1 = require("../utils/logger");
const object_1 = require("../utils/object");
const sync_helper_1 = require("../utils/sync-helper");
const yargs_1 = require("../yargs");
const Metadata_entity_1 = require("./entities/Metadata.entity");
const Poi_entity_1 = require("./entities/Poi.entity");
const poi_service_1 = require("./poi.service");
const StoreOperations_1 = require("./StoreOperations");
const types_1 = require("./types");
const logger = (0, logger_1.getLogger)('store');
const NULL_MERKEL_ROOT = (0, util_1.hexToU8a)('0x00');
const { argv } = (0, yargs_1.getYargsOption)();
const NotifyTriggerManipulationType = [`INSERT`, `DELETE`, `UPDATE`];
let StoreService = class StoreService {
    constructor(sequelize, config, poiService) {
        this.sequelize = sequelize;
        this.config = config;
        this.poiService = poiService;
    }
    async init(modelsRelations, schema) {
        this.schema = schema;
        this.modelsRelations = modelsRelations;
        this.historical = await this.getHistoricalStateEnabled();
        try {
            await this.syncSchema(this.schema);
        }
        catch (e) {
            logger.error(e, `Having a problem when syncing schema`);
            process.exit(1);
        }
        try {
            this.modelIndexedFields = await this.getAllIndexFields(this.schema);
        }
        catch (e) {
            logger.error(e, `Having a problem when get indexed fields`);
            process.exit(1);
        }
    }
    // eslint-disable-next-line complexity
    async syncSchema(schema) {
        const enumTypeMap = new Map();
        if (this.historical) {
            const [results] = await this.sequelize.query(sync_helper_1.BTREE_GIST_EXTENSION_EXIST_QUERY);
            if (results.length === 0) {
                throw new Error('Btree_gist extension is required to enable historical data, contact DB admin for support');
            }
        }
        for (const e of this.modelsRelations.enums) {
            // We shouldn't set the typename to e.name because it could potentially create SQL injection,
            // using a replacement at the type name location doesn't work.
            const enumTypeName = `${schema}_enum_${this.enumNameToHash(e.name)}`;
            const [results] = await this.sequelize.query(`select e.enumlabel as enum_value
         from pg_type t
         join pg_enum e on t.oid = e.enumtypid
         where t.typname = ?
         order by enumsortorder;`, { replacements: [enumTypeName] });
            if (results.length === 0) {
                await this.sequelize.query(`CREATE TYPE "${enumTypeName}" as ENUM (${e.values
                    .map(() => '?')
                    .join(',')});`, {
                    replacements: e.values,
                });
            }
            else {
                const currentValues = results.map((v) => v.enum_value);
                // Assert the existing enum is same
                // Make it a function to not execute potentially big joins unless needed
                if (!(0, lodash_1.isEqual)(e.values, currentValues)) {
                    throw new Error(`\n * Can't modify enum "${e.name}" between runs: \n * Before: [${currentValues.join(`,`)}] \n * After : [${e.values.join(',')}] \n * You must rerun the project to do such a change`);
                }
            }
            const comment = `@enum\\n@enumName ${e.name}${e.description ? `\\n ${e.description}` : ''}`;
            await this.sequelize.query(`COMMENT ON TYPE "${enumTypeName}" IS E?`, {
                replacements: [comment],
            });
            enumTypeMap.set(e.name, `"${enumTypeName}"`);
        }
        const extraQueries = [];
        if (argv.subscription) {
            extraQueries.push(sync_helper_1.createSendNotificationTriggerFunction);
        }
        for (const model of this.modelsRelations.models) {
            const attributes = (0, graphql_1.modelsTypeToModelAttributes)(model, enumTypeMap);
            const indexes = model.indexes.map(({ fields, unique, using }) => ({
                fields: fields.map((field) => sequelize_1.Utils.underscoredIf(field, true)),
                unique,
                using,
            }));
            if (indexes.length > this.config.indexCountLimit) {
                throw new Error(`too many indexes on entity ${model.name}`);
            }
            if (this.historical) {
                this.addIdAndBlockRangeAttributes(attributes);
                this.addBlockRangeColumnToIndexes(indexes);
            }
            const sequelizeModel = this.sequelize.define(model.name, attributes, {
                underscored: true,
                comment: model.description,
                freezeTableName: false,
                createdAt: this.config.timestampField,
                updatedAt: this.config.timestampField,
                schema,
                indexes,
            });
            if (this.historical) {
                this.addScopeAndBlockHeightHooks(sequelizeModel);
                extraQueries.push((0, sync_helper_1.createExcludeConstraintQuery)(schema, sequelizeModel.tableName));
            }
            if (argv.subscription) {
                const triggerName = `${schema}_${sequelizeModel.tableName}_notify_trigger`;
                const triggers = await this.sequelize.query((0, sync_helper_1.getNotifyTriggers)(), {
                    replacements: { triggerName },
                    type: sequelize_1.QueryTypes.SELECT,
                });
                // Triggers not been found
                if (triggers.length === 0) {
                    extraQueries.push((0, sync_helper_1.createNotifyTrigger)(schema, sequelizeModel.tableName));
                }
                else {
                    this.validateNotifyTriggers(triggerName, triggers);
                }
            }
            else {
                extraQueries.push((0, sync_helper_1.dropNotifyTrigger)(schema, sequelizeModel.tableName));
            }
        }
        const foreignKeyMap = new Map();
        for (const relation of this.modelsRelations.relations) {
            const model = this.sequelize.model(relation.from);
            const relatedModel = this.sequelize.model(relation.to);
            if (this.historical) {
                this.addRelationToMap(relation, foreignKeyMap, model, relatedModel);
                continue;
            }
            switch (relation.type) {
                case 'belongsTo': {
                    model.belongsTo(relatedModel, { foreignKey: relation.foreignKey });
                    break;
                }
                case 'hasOne': {
                    const rel = model.hasOne(relatedModel, {
                        foreignKey: relation.foreignKey,
                    });
                    const fkConstraint = (0, sync_helper_1.getFkConstraint)(rel.target.tableName, rel.foreignKey);
                    const tags = (0, sync_helper_1.smartTags)({
                        singleForeignFieldName: relation.fieldName,
                    });
                    extraQueries.push((0, sync_helper_1.commentConstraintQuery)(`"${schema}"."${rel.target.tableName}"`, fkConstraint, tags), (0, sync_helper_1.createUniqueIndexQuery)(schema, relatedModel.tableName, relation.foreignKey));
                    break;
                }
                case 'hasMany': {
                    const rel = model.hasMany(relatedModel, {
                        foreignKey: relation.foreignKey,
                    });
                    const fkConstraint = (0, sync_helper_1.getFkConstraint)(rel.target.tableName, rel.foreignKey);
                    const tags = (0, sync_helper_1.smartTags)({
                        foreignFieldName: relation.fieldName,
                    });
                    extraQueries.push((0, sync_helper_1.commentConstraintQuery)(`"${schema}"."${rel.target.tableName}"`, fkConstraint, tags));
                    break;
                }
                default:
                    throw new Error('Relation type is not supported');
            }
        }
        foreignKeyMap.forEach((keys, tableName) => {
            const comment = Array.from(keys.values())
                .map((tags) => (0, sync_helper_1.smartTags)(tags, '|'))
                .join('\n');
            const query = (0, sync_helper_1.commentTableQuery)(`"${schema}"."${tableName}"`, comment);
            extraQueries.push(query);
        });
        if (this.config.proofOfIndex) {
            this.poiRepo = (0, Poi_entity_1.PoiFactory)(this.sequelize, schema);
        }
        this.metaDataRepo = (0, Metadata_entity_1.MetadataFactory)(this.sequelize, schema);
        await this.sequelize.sync();
        await this.setMetadata('historicalStateEnabled', this.historical);
        for (const query of extraQueries) {
            await this.sequelize.query(query);
        }
    }
    async getHistoricalStateEnabled() {
        let enabled = true;
        try {
            // Throws if _metadata doesn't exist (first startup)
            const result = await this.sequelize.query(`SELECT value FROM "${this.schema}"."_metadata" WHERE key = 'historicalStateEnabled'`, { type: sequelize_1.QueryTypes.SELECT });
            if (result.length > 0) {
                // eslint-disable-next-line
                enabled = result[0]['value'];
            }
            else {
                enabled = false;
            }
        }
        catch (e) {
            enabled = !argv['disable-historical'];
        }
        logger.info(`Historical state is ${enabled ? 'enabled' : 'disabled'}`);
        return enabled;
    }
    addBlockRangeColumnToIndexes(indexes) {
        indexes.forEach((index) => {
            if (index.using === utils_1.IndexType.GIN) {
                return;
            }
            index.fields.push('_block_range');
            index.using = utils_1.IndexType.GIST;
            // GIST does not support unique indexes
            index.unique = false;
        });
    }
    addRelationToMap(relation, foreignKeys, model, relatedModel) {
        switch (relation.type) {
            case 'belongsTo': {
                (0, sync_helper_1.addTagsToForeignKeyMap)(foreignKeys, model.tableName, relation.foreignKey, {
                    foreignKey: (0, sync_helper_1.getVirtualFkTag)(relation.foreignKey, relatedModel.tableName),
                });
                break;
            }
            case 'hasOne': {
                (0, sync_helper_1.addTagsToForeignKeyMap)(foreignKeys, relatedModel.tableName, relation.foreignKey, {
                    singleForeignFieldName: relation.fieldName,
                });
                break;
            }
            case 'hasMany': {
                (0, sync_helper_1.addTagsToForeignKeyMap)(foreignKeys, relatedModel.tableName, relation.foreignKey, {
                    foreignFieldName: relation.fieldName,
                });
                break;
            }
            default:
                throw new Error('Relation type is not supported');
        }
    }
    addIdAndBlockRangeAttributes(attributes) {
        attributes.id.primaryKey = false;
        attributes.__id = {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            allowNull: false,
            primaryKey: true,
        };
        attributes.__block_range = {
            type: sequelize_1.DataTypes.RANGE(sequelize_1.DataTypes.BIGINT),
            allowNull: false,
        };
    }
    addScopeAndBlockHeightHooks(sequelizeModel) {
        sequelizeModel.addScope('defaultScope', {
            attributes: {
                exclude: ['__id', '__block_range'],
            },
        });
        sequelizeModel.addHook('beforeFind', (options) => {
            // eslint-disable-next-line
            options.where['__block_range'] = {
                [sequelize_1.Op.contains]: this.blockHeight,
            };
        });
        sequelizeModel.addHook('beforeValidate', (attributes, options) => {
            attributes.__block_range = [this.blockHeight, null];
        });
        sequelizeModel.addHook('beforeBulkCreate', (instances, options) => {
            instances.forEach((item) => {
                item.__block_range = [this.blockHeight, null];
            });
        });
    }
    validateNotifyTriggers(triggerName, triggers) {
        if (triggers.length !== NotifyTriggerManipulationType.length) {
            throw new Error(`Found ${triggers.length} ${triggerName} triggers, expected ${NotifyTriggerManipulationType.length} triggers `);
        }
        triggers.map((t) => {
            if (!NotifyTriggerManipulationType.includes(t.eventManipulation)) {
                throw new Error(`Found unexpected trigger ${t.triggerName} with manipulation ${t.eventManipulation}`);
            }
        });
    }
    enumNameToHash(enumName) {
        return (0, util_crypto_1.blake2AsHex)(enumName).substr(2, 10);
    }
    setTransaction(tx) {
        this.tx = tx;
        tx.afterCommit(() => (this.tx = undefined));
        if (this.config.proofOfIndex) {
            this.operationStack = new StoreOperations_1.StoreOperations(this.modelsRelations.models);
        }
    }
    setBlockHeight(blockHeight) {
        this.blockHeight = blockHeight;
    }
    async setMetadataBatch(metadata, options) {
        await Promise.all(metadata.map(({ key, value }) => this.setMetadata(key, value, options)));
    }
    async setMetadata(key, value, options) {
        (0, assert_1.default)(this.metaDataRepo, `Model _metadata does not exist`);
        await this.metaDataRepo.upsert({ key, value }, options);
    }
    async setPoi(blockPoi, options) {
        (0, assert_1.default)(this.poiRepo, `Model _poi does not exist`);
        blockPoi.chainBlockHash = (0, util_1.u8aToBuffer)(blockPoi.chainBlockHash);
        blockPoi.hash = (0, util_1.u8aToBuffer)(blockPoi.hash);
        blockPoi.parentHash = (0, util_1.u8aToBuffer)(blockPoi.parentHash);
        await this.poiRepo.upsert(blockPoi, options);
    }
    getOperationMerkleRoot() {
        if (this.config.proofOfIndex) {
            this.operationStack.makeOperationMerkleTree();
            const merkelRoot = this.operationStack.getOperationMerkleRoot();
            if (merkelRoot === null) {
                return NULL_MERKEL_ROOT;
            }
            return merkelRoot;
        }
        return NULL_MERKEL_ROOT;
    }
    async getAllIndexFields(schema) {
        const fields = [];
        for (const entity of this.modelsRelations.models) {
            const model = this.sequelize.model(entity.name);
            const tableFields = await this.packEntityFields(schema, entity.name, model.tableName);
            fields.push(tableFields);
        }
        return (0, lodash_1.flatten)(fields);
    }
    async packEntityFields(schema, entity, table) {
        const rows = await this.sequelize.query(`select
    '${entity}' as entity_name,
    a.attname as field_name,
    idx.indisunique as is_unique,
    am.amname as type
from
    pg_index idx
    JOIN pg_class cls ON cls.oid=idx.indexrelid
    JOIN pg_class tab ON tab.oid=idx.indrelid
    JOIN pg_am am ON am.oid=cls.relam,
    pg_namespace n,
    pg_attribute a
where
  n.nspname = '${schema}'
  and tab.relname = '${table}'
  and a.attrelid = tab.oid
  and a.attnum = ANY(idx.indkey)
  and not idx.indisprimary
group by
    n.nspname,
    a.attname,
    tab.relname,
    idx.indisunique,
    am.amname`, {
            type: sequelize_1.QueryTypes.SELECT,
        });
        return rows.map((result) => (0, object_1.camelCaseObjectKey)(result));
    }
    async markAsDeleted(model, id) {
        return model.update({
            __block_range: this.sequelize.fn('int8range', this.sequelize.fn('lower', this.sequelize.col('_block_range')), this.blockHeight),
        }, {
            hooks: false,
            transaction: this.tx,
            where: {
                id: id,
                __block_range: {
                    [sequelize_1.Op.contains]: this.blockHeight,
                },
            },
        });
    }
    getStore() {
        return {
            get: async (entity, id) => {
                const model = this.sequelize.model(entity);
                (0, assert_1.default)(model, `model ${entity} not exists`);
                const record = await model.findOne({
                    where: { id },
                    transaction: this.tx,
                });
                return record === null || record === void 0 ? void 0 : record.toJSON();
            },
            getByField: async (entity, field, value) => {
                const model = this.sequelize.model(entity);
                (0, assert_1.default)(model, `model ${entity} not exists`);
                const indexed = this.modelIndexedFields.findIndex((indexField) => (0, lodash_1.upperFirst)((0, lodash_1.camelCase)(indexField.entityName)) === entity &&
                    (0, lodash_1.camelCase)(indexField.fieldName) === field) > -1;
                (0, assert_1.default)(indexed, `to query by field ${field}, an index must be created on model ${entity}`);
                const records = await model.findAll({
                    where: { [field]: value },
                    transaction: this.tx,
                    limit: this.config.queryLimit,
                });
                return records.map((record) => record.toJSON());
            },
            getOneByField: async (entity, field, value) => {
                const model = this.sequelize.model(entity);
                (0, assert_1.default)(model, `model ${entity} not exists`);
                const indexed = this.modelIndexedFields.findIndex((indexField) => (0, lodash_1.upperFirst)((0, lodash_1.camelCase)(indexField.entityName)) === entity &&
                    (0, lodash_1.camelCase)(indexField.fieldName) === field &&
                    indexField.isUnique) > -1;
                (0, assert_1.default)(indexed, `to query by field ${field}, an unique index must be created on model ${entity}`);
                const record = await model.findOne({
                    where: { [field]: value },
                    transaction: this.tx,
                });
                return record === null || record === void 0 ? void 0 : record.toJSON();
            },
            set: async (entity, _id, data) => {
                const model = this.sequelize.model(entity);
                (0, assert_1.default)(model, `model ${entity} not exists`);
                const attributes = data;
                if (this.historical) {
                    // If entity was already saved in current block, update that entity instead
                    const [updatedRows] = await model.update(attributes, {
                        hooks: false,
                        transaction: this.tx,
                        where: this.sequelize.and({ id: data.id }, this.sequelize.where(this.sequelize.fn('lower', this.sequelize.col('_block_range')), this.blockHeight)),
                    });
                    if (updatedRows < 1) {
                        await this.markAsDeleted(model, data.id);
                        await model.create(attributes, {
                            transaction: this.tx,
                        });
                    }
                }
                else {
                    await model.upsert(attributes, {
                        transaction: this.tx,
                    });
                }
                if (this.config.proofOfIndex) {
                    this.operationStack.put(types_1.OperationType.Set, entity, data);
                }
            },
            bulkCreate: async (entity, data) => {
                const model = this.sequelize.model(entity);
                (0, assert_1.default)(model, `model ${entity} not exists`);
                await model.bulkCreate(data, {
                    transaction: this.tx,
                });
                if (this.config.proofOfIndex) {
                    for (const item of data) {
                        this.operationStack.put(types_1.OperationType.Set, entity, item);
                    }
                }
            },
            remove: async (entity, id) => {
                const model = this.sequelize.model(entity);
                (0, assert_1.default)(model, `model ${entity} not exists`);
                if (this.historical) {
                    await this.markAsDeleted(model, id);
                }
                else {
                    await model.destroy({ where: { id }, transaction: this.tx });
                }
                if (this.config.proofOfIndex) {
                    this.operationStack.put(types_1.OperationType.Remove, entity, id);
                }
            },
        };
    }
};
StoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [sequelize_1.Sequelize,
        NodeConfig_1.NodeConfig,
        poi_service_1.PoiService])
], StoreService);
exports.StoreService = StoreService;
//# sourceMappingURL=store.service.js.map