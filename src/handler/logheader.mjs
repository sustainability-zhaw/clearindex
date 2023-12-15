import {getLogger} from "service_logger";

const log = getLogger("handler/logheader");

export async function logHeader(ctx, next) {
    log.performance("request start");
    log.data({
        info: "request",
        method: ctx.request.method,
        url: ctx.request.url,
        header: ctx.request.header,
        body: ctx.request.body
    });

    await next();
}
