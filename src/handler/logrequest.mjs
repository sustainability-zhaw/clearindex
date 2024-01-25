import * as Logger from "service_logger";

const log = Logger.get("handler/logrequest");

export async function logRequest(ctx, next) {
    log.performance("request done");
    log.data({
        info: "response",
        status: ctx.status,
        body: ctx.response.body,
        header: ctx.response.header
    });

    await next();
}
