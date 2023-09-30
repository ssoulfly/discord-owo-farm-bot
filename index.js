const fs = require("fs");
const axios = require("axios");
const WebSocket = require("ws");

const config = require("./config.json");

let connected = 0;
const tokens = fs.readFileSync("data/tokens.txt", "utf-8").split(/[\n|\s]/g);
const channels = fs
  .readFileSync("data/channels.txt", "utf-8")
  .split(/[\n|\s]/g);
const messages = fs.readFileSync("data/messages.txt", "utf-8").split(/[\n]/g);

function clientCreate(token, eventCallback, client = false) {
  const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
  let session_id = null;
  let seq = {};
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        op: 2,
        d: {
          token: token,
          properties: {
            $os: "macos",
            $browser: "node.js",
            $device: "node.js",
          },
          intents: client ? 32768 | 512 | 2 : 0,
        },
      })
    );
  });

  ws.on("message", async (data) => {
    const payload = JSON.parse(data);
    switch (payload.op) {
      case 10:
        const heartbeatInterval = payload.d.heartbeat_interval;
        setInterval(() => {
          const heartbeatPayload = {
            op: 1,
            d: null,
          };
          ws.send(JSON.stringify(heartbeatPayload));
        }, heartbeatInterval - 1000);
        break;
      case 9:
        ws.close();
        clientCreate(token, eventCallback, client);
        break;
      case 10:
        socket.send(
          JSON.stringify({
            op: 6,
            d: {
              token,
              session_id,
              seq,
            },
          })
        );
        break;
      case 0:
        if (payload.t == "MESSAGE_CREATE") {
          eventCallback(payload.t, payload.d);
          seq = payload.s;
        } else if (payload.t == "READY") {
          eventCallback(payload.t, payload.d);
          session_id = payload.d.session_id;
        }
        break;
    }
  });

  ws.on("close", (code, reason) => {
    eventCallback("CLOSE", code, Buffer.from(reason).toString());
  });

  ws.on("error", (error) => {
    eventCallback("ERROR", error);
  });
}

const reset = "\x1b[0m";
const bashColors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function colorize(text) {
  console.log(`${bashColors[config.consoleColor]}${text}${reset}`);
}

async function createWebhook(content) {
  await axios.post(config.webhookURL, { content });
}

async function sendMessage(token, channelId, content) {
  axios
    .post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { content, nonce: Date.now().toString() },
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      }
    )
    .catch((error) => {
      console.error("Mesaj gönderilirken hata oluştu:", error);
    });
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const randomChannel = () =>
  channels[Math.floor(Math.random() * (channels.length - 1))];

clientCreate(
  config.token,
  async (type, content) => {
    if (type == "READY") {
      let date = new Date();
      date = `${date.getFullYear()}/${date.getMonth()}/${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
      colorize(
        `[${date}] ${content.user.username}#${content.user.discriminator} Bot is Ready.`
      );
      colorize(
        `[SYSTEM]: Total Have ${tokens.length} Token, ${messages.length} Messages, ${channels.length} Channels.`
      );
      await Promise.all(
        tokens.map((token, index) => {
          return new Promise((resolve) => {
            colorize(`[TOKEN ${index + 1}]: RUNNING!`);
            const randomMessage = async () => {
              const message =
                messages[Math.floor(Math.random() * (messages.length - 1))];
              const channel = randomChannel();
              sendMessage(token, channel, message);
              colorize(`[MESSAGE_CREATED]: (${channel}) ${message} !`);
            };

            clientCreate(token, async (type, _1, _2) => {
              if (type == "READY") {
                resolve();
                connected++;
                colorize(`[TOKEN ${index + 1} READY]:  CONNECTED!`);
                if (!config.disableSendMessage) {
                  setInterval(async () => {
                    await randomMessage();
                  }, random(config.delay.min, config.delay.max) * 1000);
                }
              } else if (type == "ERROR") {
                resolve();
                colorize(`[TOKEN ${index + 1}: ERROR] NOT CONNECTED!`);
              } else if (type == "CLOSE") {
                console.log(_1, _2);
              }
            });
          });
        })
      );
      colorize(
        `[RESULT]: ${connected} Token is Active, ${
          tokens.length - connected
        } Token is Disabled.`
      );
    } else if (
      type == "MESSAGE_CREATE" &&
      content.author.id == config.owoId &&
      content.attachments.length > 0
    ) {
      createWebhook(`${content.attachments[0].url}\n${content.content}`);
    }
  },
  true
);
