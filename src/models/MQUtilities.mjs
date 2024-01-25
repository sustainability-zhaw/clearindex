import amqp from "amqplib";
import * as Logger from "service_logger";

import { setTimeout } from "node:timers/promises";

const log = Logger.get("MQUtilities");
const Connection = {};

export function init(options) {
    Connection.target = options.mq_exchange;
    Connection.sendkey = options.mq_key;

    Connection.host = {
        protocol: 'amqp',
        hostname: options.mq_host,
        // port: 5672,
        username: options.mq_user,
        password: options.mq_pass,
        // locale: 'en_US',
        // frameMax: 0,
        heartbeat: 3600,
        // vhost: '/',
      };

      log.log({message: `MQ target: ${JSON.stringify(Connection)}`});
 }

export async function connect() {
    if (Connection.conn) {
        log.log("close existing connection");
        await Connection.conn.close();
        
        delete Connection.conn;
        log.debug("connection closed");
    }

    log.debug(`connect to MQ target: ${JSON.stringify(Connection.host)}`);

    Connection.conn = await amqp.connect(Connection.host);
    log.debug("MQ connected");

    Connection.channel = await Connection.conn.createChannel();
    log.debug("MQ channel created");
}

function waitRandomTime(min, max) {
    const waitRange = Math.floor(
        (Math.random() * ((max + 1) - min) + min) * 1000
    );

    return setTimeout(waitRange);
}

export async function signal(updates) {
    if (!(updates && (updates.length || Object.keys(updates).length))) {
        log.info("skip signal");
    }

    log.debug(`signal ${Connection.sendkey} with ${JSON.stringify(updates)}`);
    try {
        Connection.channel.publish(
            Connection.target,
            Connection.sendkey,
            Buffer.from(JSON.stringify(updates))
        );
    }
    catch (err) {
        log.warning(`MQ ERROR ${err.message}`);
        // there are 2 reasons for an error:
        // 1. the file is invalid
        // 2. the MQ connection is broken

        log.warning(`retry in 15 seconds`);

        await waitRandomTime(14, 18)
        // await setTimeout(15000, "retry");
        
        log.notice(`retry now`);
        await connect();

        try {
            Connection.channel.publish(
                Connection.target,
                Connection.sendkey,
                Buffer.from(JSON.stringify(updates))
            );
        }
        catch (err) {
            log.alert(`UNRECOVERABLE MQ ERROR for ${err.message}`);
        }
    }
}
