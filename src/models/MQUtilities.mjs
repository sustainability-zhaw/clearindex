import amqp from "amqplib";

import { setTimeout } from "node:timers/promises";

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

    console.log(`MQ target: ${JSON.stringify(Connection)}`);
 }

export async function connect() {
    if (Connection.conn) {
        await Connection.conn.close();
    }

    Connection.conn = await amqp.connect(Connection.host);
    Connection.channel = await Connection.conn.createChannel();
}

export async function signal(updates) {
    if (!(updates && (updates.length || Object.keys(updates).length))) {
        console.log("skip signal");
    }

    console.log(`signal ${Connection.sendkey} with ${JSON.stringify(updates)}`);
    try {
        Connection.channel.publish(
            Connection.target,
            Connection.sendkey,
            Buffer.from(JSON.stringify(updates))
        );
    }
    catch (err) {
        console.log(`MQ ERROR ${err.message}`);
        // there are 2 reasons for an error:
        // 1. the file is invalid
        // 2. the MQ connection is broken

        console.log(`retry in 15 seconds`);

        await setTimeout(15000, "retry");
        console.log(`retry now`);
        await connect();

        try {
            Connection.channel.publish(
                Connection.target,
                Connection.sendkey,
                Buffer.from(JSON.stringify(updates))
            );
        }
        catch (err) {
            console.log(`UNRECOVERABLE MQ ERROR for ${err.message}`);
        }
    }
}
