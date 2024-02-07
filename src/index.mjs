import * as Config from "@phish108/yaml-configurator";
import * as Logger from "service_logger";

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

import defaults from "./defaults.json" with {type: "json"};
// const defaults = {};

// load from the first location that matches.
const cfg = await Config.readConfig(
    [
        "/etc/app/config.yaml",
        "/etc/app/config.json", // this is a fallback due to python service inconsistencies
        "./config.yaml",
        "./tools/config.yaml",
    ],
    ["service.dbhost", "service.mq_host"],
    defaults
);

Logger.init(cfg.debug);

const log = Logger.get("index");

log.debug(cfg);

// connect to the message queue but keep the service up if it fails
try {
    MQ.init(cfg.service);
    MQ.connect();
}
catch (err) {
    log.error(err);
}

const app = new Koa();
const router = new Router;

router.get("/", KoaCompose([
    // normally we will not enter here
    logHeader,
    respondHelo,
    logRequest
]));


router.get("/clearall", KoaCompose([
    // normally we will enter here
    logHeader,
    updateIndex(cfg),
    logRequest
]));

app.use(router.routes());

// start the server
app.listen(cfg.api.port);
