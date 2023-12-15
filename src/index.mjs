import * as Config from "@phish108/yaml-configurator";
import {initLogger, getLogger} from "service-logger";

import Koa from "koa";
import Router from "@koa/router";
import KoaCompose from "koa-compose";
import koaBody from "koa-body";

// load from the first location that matches.
const cfg = await Config.readConfig(
        [
            "/etc/app/config.yaml",
            "./config.yaml", 
            "./tools/config.yaml"
        ],
        ["service.dbhost", "service.mq_host"],
        {
            service: {
                mq_exchange: "",
                mq_key: ""
            },
            debug: {
                level: "debug"
            }
        }
);

initLogger({level: cfg.debug.level});

// the index should load the config, setup the API endpoints and connect to rabbitMQ. 

// Unfortunately, it is impossible to drop all edges between graph nodes in dgraph

// 1. Get all matching terms and object links and sdgs.

// For each term we have to do this
// 2. drop all objects from matching terms, build object sdgs and terms 

// For all info objects
// 3. drop all sdgs and matching terms from infoobjects

// After a term is fully cleared, it can get reindexed via a message to the indexer.

