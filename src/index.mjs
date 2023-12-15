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

    // Unfortunately, it is impossible to drop all edges between graph nodes in dgraph
    
    // 1. Get all matching terms and object links and sdgs.
    const data = await fetchMatches();

    if (data.matches && data.matches.length) {
        // For all terms drop their matches
        await Promise.all(data.matches.map(dropMatch));
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

    const result = await runRequest(cfg.service.dbhost);

    if ("errors" in result) {
        console.log(`fetching data failed: ${JSON.stringify(result.errors, null, "  ")}`);
    }

    return result.data;
}

async function dropMatch(match) {

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

    const query = `
    mutation dropMatches($construct: UpdateSdgMatchInput!, $matcher: UpdateInfoObjectInput!) {
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

    const result = await runRequest(cfg.service.dbhost, { query, variables });

    if ("errors" in result) {
        log.error(`dropping data failed: ${JSON.stringify(result.errors, null, "  ")}`);
    }

    // After a term is fully cleared, it can get reindexed via a message to the indexer.

    // SIGNAL TO REINDEX
}

async function runRequest(targetHost, bodyObject) {
    const method = "POST"; // all requests are POST requests
    const cache = "no-store";

    const headers = {
        'Content-Type': 'application/json'
    };

    const body = JSON.stringify(bodyObject, null, "  ");

    let result;
    let n = 0;

    while (n++ < 10 && (!result || ("errors" in  result && result.errors[0].message.endsWith("Please retry")))) {
        const RequestController = new AbortController();
        const {signal} = RequestController;

        const response = await fetch(targetHost, {
            signal,
            method,
            headers,
            cache,
            body
        });
            
        result = await response.json();

        await setTimeout(Math.floor(Math.random() * 10000));
    }

    if (n === 10) {
        console.log("FATAL: Failed after 10 retries");
    }

    return result;
}