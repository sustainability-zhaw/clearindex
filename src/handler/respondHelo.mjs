import * as Logger from "service_logger";

const log = Logger.get("handler/respondHelo");

export async function respondHelo(ctx, next) {
    log.notice("respond helo");

    ctx.body = {
        message: "helo"
    };

    await next();
}
