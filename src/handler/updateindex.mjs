import * as Logger from "service_logger";
import * as MQ from "../models/MQUtilities.mjs";

const log = Logger.get("handler/updateIndex");

const cfg = {};

export function updateIndex(config) {
    cfg.service = config.service;
    cfg.dbServiceUrl = `http://${config.service.dbhost}/graphql`;

    return handler;
}

async function handler(ctx, next) {
    // Unfortunately, it is impossible to drop all edges between graph nodes
    // in dgraph

    // 1. Get all matching terms and object links and sdgs.
    const data = await fetchMatches();

    if (data && Object.keys(data).length) {
        // For all terms drop their matches from the related objects

        await Promise.all(Object.entries(data).map(dropSDG));
        ctx.body = {message: "OK"};
    }
    else {
        log.debug(data);

        ctx.body = {message: "no matches to reindex"};
    }

    await next();
}

async function fetchMatches() {
    const query = `
    query {
        matches: querySdgMatch(filter: {has: objects})
        {
            construct
            sdg { 
                id 
            }
        }
    }`;

    const result = await runRequest(cfg.dbServiceUrl, {query});

    if ("errors" in result) {
        log.error(
            `fetching data failed: ${JSON.stringify(result.errors, null, "  ")}`
        );
    }

    // if data was loaded, it will be remapped by SDG.id
    // log.debug(result.data);

    return result.data?.matches?.reduce(arrangeConstructs, {});
}

function arrangeConstructs(index, construct) {
    const sdgid = construct.sdg?.id;

    if (!(sdgid in index)) {
        index[sdgid] = [];
    }

    construct = construct.construct;

    index[sdgid].push({construct});

    return index;
}

/**
 * dropSDG removes ONE SDG from the info objects
 *
 * @param {String} sdg
 * @param {Array} constructs
 *
 * This function asks each construct's index to be deleted from the database.
 * Once all constructs are deleted, the function signals to the message queue
 * that the SDG is unindexed.
 *
 * This function should called from within an Object.entries().map() chain.
 * Such chain guarantees that the object key is the first value and the
 * data is the second.
 */
async function dropSDG([sdg, constructs]) {
    const szBatch = 15;
    const query = `
    mutation deleteMatches($patch: UpdateInfoObjectInput!){
        updateInfoObject(input:$patch) {
             numUids
        }
    }`;

    log.debug(`dropSDG ${sdg} with ${constructs.length} constructs`);

    // drop constructs in batches of 50
    const nBatches = ~~(constructs.length / szBatch) + 1;

    log.debug(`dropSDG ${sdg} in ${nBatches + 1} batches`);

    const variables = {
        "patch": {
            "filter": {},
            "remove": {
                "sdgs": [{"id": sdg}],
                "sdg_matches": []
            }
        }
    };

    // The following loop is necessary because dgraph cannot handle too many parallel mutations
    // as this would lead dgraph into crashing :(
    // To overcome this problem/bug/shortcoming, this loop will enforce strictly sequential mutations.
    for (let i = 0; i < nBatches; i++) {
        variables.patch.remove.sdg_matches = constructs.slice(i * szBatch , i * szBatch + szBatch);

        log.debug(`dropSDG ${sdg} batch ${i + 1}`);

        const result = await runRequest(cfg.dbServiceUrl, { query, variables });

        if ("errors" in result) {
            log.error(
                `dropping data failed: ${JSON.stringify(result.errors, null, "  ")}`
            );
        }
    }

    // After the terms are fully cleared,
    //    it can get reindexed via a message to the indexer.

    // SIGNAL TO REINDEX
    MQ.signal({sdg});
}

async function runRequest(targetHost, bodyObject) {
    let result;
    let n = 0;

    const RequestController = new AbortController();
    const {signal} = RequestController;

    while (!result && n < 10) {
        n += 1;
        result = await fetchJson(targetHost, signal, bodyObject);
    }

    if (!result) {
        log.error("FATAL: Failed after 10 retries");
    }

    return result;
}

function waitRandomTime(min, max) {
    const waitRange = Math.floor(
        (Math.random() * (max + 1 - min) + min) * 1000
    );

    return new Promise((r) => setTimeout(r, waitRange));
}

async function fetchJson(targetHost, signal, jsonObj) {
    const method = "POST"; // all GQL requests are POST requests
    const cache = "no-store";

    const headers = {
        "Content-Type": "application/json"
    };

    const body = JSON.stringify(jsonObj);

    let result;

    // log.debug(`fetch ${targetHost} with ${body}`);

    try {
        const response = await fetch(targetHost, {
            signal,
            method,
            headers,
            cache,
            body
        });

        result = await response.json();
    }
    catch (err) {
        log.error(`fetching ${targetHost} failed: ${err.message}`);
        // there are 2 reasons for an error:
        // 1. the file is invalid
        // 2. the MQ connection is broken

        result = { data: [] };
    }

    if (!result ||
        "errors" in  result &&
         result.errors[0].message.endsWith("Please retry")) {
        // if asked to retry, wait for 10-45 seconds
        await waitRandomTime(10, 45);
        return null;
    }

    return result;
}
