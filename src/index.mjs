import * as Config from "@phish108/yaml-configurator";
import {initLogger, getLogger} from "service_logger";

import Koa from "koa";
import Router from "@koa/router";
import KoaCompose from "koa-compose";
import koaBody from "koa-body";

import * as MQ from "./models/MQUtilities.mjs";

import {
    logHeader,
    logRequest,
    updateIndex,
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

MQ.init(cfg.service);

const dbServiceUrl = `http://${cfg.service.dbhost}/graphql`

const app = new Koa();
const router = new Router;

router.get("/", KoaCompose([
    // normally we will not enter here
    logHeader,
    respondHelo,
    logRequest
]));

// The endpoint accepts currently any request body
router.get("/clearall", koaBody.koaBody(), KoaCompose([
    // normally we will enter here
    logHeader,
    updateIndex(cfg),
    logRequest
]));

app.use(router.routes());

// start the server
MQ.connect();
app.listen(cfg.port || 8080);
