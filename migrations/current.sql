CREATE SCHEMA IF NOT EXISTS app;
SET SCHEMA 'app';
DROP FUNCTION IF EXISTS plv8ify_migrationMicroAgentAlmanacRegistrations();
CREATE OR REPLACE FUNCTION plv8ify_migrationMicroAgentAlmanacRegistrations() RETURNS JSONB AS $plv8ify$
var plv8ify = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // migrations/current.ts
  var current_exports = {};
  __export(current_exports, {
    migrationMicroAgentAlmanacRegistrations: () => migrationMicroAgentAlmanacRegistrations
  });

  // migrations/src/utils.ts
  function getSelectResults(rows) {
    if (rows.length < 1) {
      return null;
    }
    return rows.map((row) => Object.entries(row).map((e) => e[1]));
  }

  // migrations/current.ts
  function migrationMicroAgentAlmanacRegistrations() {
    const selectRegisterEventIds = `SELECT ev.id
                                  FROM events ev
                                           JOIN event_attributes ea ON ev.id = ea.event_id
                                  WHERE ev.type = "/cosmwasm.wasm.v1.MsgExecuteContract"
                                    AND ea.key = "action"
                                    AND ea.value = "register"`;
    const selectRegisterEventData = `SELECT ev.id ev.transaction_id, ev.block_id, ea.key, ea.value
                                   FROM events ev
                                            JOIN event_attributes ea ON ev.id = ea.event_id
                                   WHERE ev.id in (${selectRegisterEventIds})`;
    const registerEventData = getSelectResults(plv8.execute(selectRegisterEventData));
    const eventIds = {};
    const agents = {};
    const services = {};
    const expiryHeights = {};
    const signatures = {};
    const sequences = {};
    const contracts = {};
    const txIds = {};
    const blockIds = {};
    for (const record of registerEventData) {
      if (record.length < 5) {
        plv8.elog(WARNING, `unable to migrate registration event; event ID: ${record[0]}`);
        continue;
      }
      const [eventId, txId, blockId, key, value] = record;
      eventIds[eventId] = null;
      if (!txIds[eventId]) {
        txIds[eventId] = txId;
      }
      if (!blockIds[eventId]) {
        blockIds[eventId] = blockId;
      }
      switch (key) {
        case "_contract_address":
          contracts[eventId] = value;
          break;
        case "agent_address":
          agents[eventId] = value;
          break;
        case "record":
          try {
            const service = JSON.parse(value).service;
            if (!service) {
              throw new Error("expected record to contain service key but none found");
            }
            services[eventId] = JSON.stringify(service);
          } catch (e) {
            plv8.elog(WARNING, `unable to parse expected JSON value: "${value}"`);
            continue;
          }
          break;
        case "signature":
          signatures[eventId] = value;
          break;
        case "sequence":
          sequences[eventId] = value;
          break;
        case "expiry_height":
          expiryHeights[eventId] = value;
          break;
      }
    }
    const agentIdValues = Object.values(agents).map((id) => `('${id}')`).join(", ");
    const insertAgents = `INSERT INTO agents (id) VALUES ${agentIdValues} ON CONFLICT DO NOTHING`;
    plv8.execute(insertAgents);
    const recordValues = Object.keys(eventIds).map((eventId) => {
      return "(" + [
        eventId,
        services[eventId],
        txIds[eventId],
        blockIds[eventId]
      ].map((e) => `'${e}'`).join(", ") + ")";
    }).join(", ");
    plv8.execute(`INSERT INTO records (id, service, transaction_id, block_id)
                VALUES ${recordValues}`);
    const registrationValues = Object.keys(eventIds).map((eventId) => {
      return "(" + [
        eventId,
        expiryHeights[eventId],
        signatures[eventId],
        sequences[eventId],
        agents[eventId],
        eventId,
        contracts[eventId],
        txIds[eventId],
        blockIds[eventId]
      ].map((e) => `'${e}'`).join(", ") + ")";
    }).join(", ");
    const insertRegistrations = `INSERT INTO registrations (id, expiry_height, signature, sequence, agent_id, record_id,
                                                          contract_id, transaction_id, block_id)
                               VALUES ${registrationValues}`;
    plv8.execute(insertRegistrations);
  }
  return __toCommonJS(current_exports);
})();

return plv8ify.migrationMicroAgentAlmanacRegistrations()

$plv8ify$ LANGUAGE plv8 IMMUTABLE STRICT;
SELECT * from plv8ify_migrationMicroAgentAlmanacRegistrations();
