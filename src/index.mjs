import * as Config from "@phish108/yaml-configurator";
import {initLogger, getLogger} from "service_logger";

import Koa from "koa";
import Router from "@koa/router";
import KoaCompose from "koa-compose";
import koaBody from "koa-body";

import {
    logHeader,
    logRequest,
    // checkquery,
    // buildfile,
    respondHelo
} from "./handler/index.mjs";

// fetch the defaults from file
import defaults from "./defaults.json" assert {type: "json"};

// load from the first location that matches.
const cfg = await Config.readConfig(
        [
            "/etc/app/config.yaml",
            "./config.yaml", 
            "./tools/config.yaml"
        ],
        ["service.dbhost", "service.mq_host"],
        defaults
);

initLogger({level: cfg.debug.level});

const log = getLogger("index");

log.debug(cfg)

const dbServiceUrl = `http://${cfg.service.dbhost}/graphql`

const app = new Koa();
const router = new Router;

router.get("/", KoaCompose([
    // normally we will not enter here
    logHeader,
    respondHelo,
    logRequest
]));

router.post("/", koaBody.koaBody(), KoaCompose([
    // normally we will enter here
    logHeader,
    updateIndex,
    logRequest
]));

app.use(router.routes());

async function updateIndex(ctx, next) {
    // Unfortunately, it is impossible to drop all edges between graph nodes
    //   in dgraph
    
    // 1. Get all matching terms and object links and sdgs.
    const data = await fetchMatches();

    if (data.matches && Object.keys(data.matches).length) {
        // For all terms drop their matches

        await Promise.all(Object.entries(data.matches).map(dropSDG));
        ctx.body = {message: "OK"}
    }
    else {
        ctx.body = {message: "no matches to reindex"}
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
            objects {
                link
            }
        }
    }`;

    const result = await runRequest(cfg.service.dbhost, {query});

    if ("errors" in result) {
        log.error(
            `fetching data failed: ${JSON.stringify(result.errors, null, "  ")}`
        );
    }

    // if data was loaded, it will be remapped by SDG.id
    return result.data?.reduce(arrangeConstructs, {});
}

function arrangeConstructs(index, construct) {
    const sdgid = construct.sdg?.id;

    if (!(sdgid in index)) {
        index[sdgid] = [];
    }

    index[sdgid].push(construct);

    return index;
}

/**
 * dropSDG removes ONE SDG from the database
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
    await Promise.all(constructs.map(dropMatch));
    
    // After the terms are fully cleared, 
    //    it can get reindexed via a message to the indexer.

    // SIGNAL TO REINDEX
    MQ.signal({sdg});
}

async function dropMatch(match) {
    const query = `
    mutation dropMatches(
        $construct: UpdateSdgMatchInput!, 
        $matcher: UpdateInfoObjectInput!
    ) {
      updateSdgMatch (input: $construct) {
        sdgMatch {
          construct
        }
      }
      
      updateInfoObject (input: $matcher) {
        infoObject {
          link
        }
      }
    }`;

    // 2. drop all objects from matching terms, build object sdgs and terms 
    const construct = {
        "filter": {"construct": {"eq": match.construct}},
        "remove": {
          "objects": match.objects
        }
      }

    // 3. drop all sdgs and matching terms from infoobjects
    const matcher = {
        "filter": {"has": "sdg_matches"},
        "remove": {
            "sdg_matches": [{"construct": match.construct}],
            "sdgs": [{"id": match.sdg.id}]
        }
    };

    const variables = { construct, matcher };

    const result = await runRequest(cfg.service.dbhost, { query, variables });

    if ("errors" in result) {
        log.error(
            `dropping data failed: ${JSON.stringify(result.errors, null, "  ")}`
        );
    }
}

async function runRequest(targetHost, bodyObject) {
    let result;
    let n = 0;

    const RequestController = new AbortController();
    const {signal} = RequestController;

    while (!result && n++ < 10) {
        result = await fetchJson(targetHost, signal, bodyObject)
    }

    if (!result) {
        console.log("FATAL: Failed after 10 retries");
    }

    return result;
}

function waitRandomTime(min, max) {
    const waitRange = Math.floor(
        (Math.random() * ((max + 1) - min) + min) * 1000
    );

    return setTimeout(waitRange);
}

async function fetchJson(targetHost, signal, jsonObj) {
    const method = "POST"; // all GQL requests are POST requests
    const cache = "no-store";

    const headers = {
        'Content-Type': 'application/json'
    };

    const body = JSON.stringify(jsonObj);

    const response = await fetch(targetHost, {
        signal,
        method,
        headers,
        cache,
        body
    });
        
    result = await response.json();

    if (!result || 
        ("errors" in  result && 
         esult.errors[0].message.endsWith("Please retry"))) {
        // if asked to retry, wait for 10-45 seconds
        await waitRandomTime(10, 45);
        return null;
    }

    return result;
}
