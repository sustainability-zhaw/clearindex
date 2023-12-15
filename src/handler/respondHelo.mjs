import {getLogger} from "service_logger";

const log = getLogger("handler/respondHelo");

export async function respondHelo(ctx, next) {
    log.notice("respond helo");

    ctx.body = {
        message: "helo"
    };

    await next();
}
