const items = [
  {
    type: "pronunciation",
    alternatives: [
      {
        confidence: "0.999",
        content: "New",
      },
    ],
    start_time: "9.84",
    end_time: "10.229",
  },
  {
    type: "pronunciation",
    alternatives: [
      {
        confidence: "0.999",
        content: "York",
      },
    ],
    start_time: "10.239",
    end_time: "10.699",
  },
  // ...
];

import fs from "fs";
import mysql from "mysql2/promise";
import OpenAI from "openai";

const HOST = "singleStoreAddress";
const PORT = 3333;
const USER = "";
const PASSWORD = "";
const DATABASE = "";

// main is run at the end
async function main() {
  let connection;
  try {
    connection = await getOpenStoreConnection();

    const transcriptions = getTranscriptions();
    let aggregatedInputs = [];
    for (let i = 0; i < transcriptions.length; i++) {
      const dbData = {};
      dbData.transcription = transcriptions[i].prase;
      dbData.timestamp = transcriptions[i].initialTimestamp;
      dbData.endTimestamp = transcriptions[i].endTimestamp;
      aggregatedInputs.push(dbData);
      // not pretty but works as a batch to not hit the rate limit
      if (aggregatedInputs.length === 20 || transcriptions.length < i + 20) {
        const embeddings = await getEmbeddings(aggregatedInputs.map((input) => input.transcription));
        aggregatedInputs = aggregatedInputs.map((input, index) => {
          input.vector = embeddings[index];
          return input;
        });
        await insertEmbedding(connection, aggregatedInputs, "");
        aggregatedInputs = [];
        console.log(`Finished processing ${i + 1} of ${transcriptions.length} items`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } catch (err) {
    console.error("ERROR", err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();

function getTranscriptions() {
  let prase = "";
  let initialTimestamp = "";
  let endTimestamp = "";
  let fullList = [];

  // items is the array of transcriptions, we aggregate single words into phrases to avoid saving single words
  for (const item of items) {
    if (prase === "") {
      initialTimestamp = parseInt(item.start_time);
    }

    if (item.alternatives[0].confidence !== "0.0") {
      prase += item.alternatives[0].content + " ";
      endTimestamp = item.end_time;
    } else {
      fullList.push({
        prase,
        initialTimestamp,
        endTimestamp: parseInt(endTimestamp),
      });
      prase = "";
      initialTimestamp = "";
    }
  }

  return fullList;
}

async function getOpenStoreConnection() {
  try {
    const singleStoreConnection = mysql.createPool({
      connectionLimit: 10,
      host: HOST,
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: DATABASE,
      ssl: {
        ca: fs.readFileSync("./singlestore_bundle.pem"),
      },
    });

    console.log("You have successfully connected to SingleStore.");
    return singleStoreConnection;
  } catch (err) {
    console.error("ERROR", err);
    process.exit(1);
  }
}

async function getEmbeddings(data) {
  const openai = new OpenAI({
    apiKey: "your-api-key",
  });
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: data,
    encoding_format: "float",
  });

  return embedding.data.map((item) => item.embedding);
}

async function insertEmbedding(connection, data, video) {
  // flatData is a flat array of all the data to be inserted
  const flatData = data.reduce((acc, item) => {
    acc.push(item.transcription, video, item.timestamp, item.endTimestamp, JSON.stringify(item.vector));
    return acc;
  }, []);

  const [rows] = await connection.execute(
    `INSERT INTO transcriptions (transcription, video, timestamp, end_timestamp, vector) VALUES ${data.map((v) => "(?, ?, ?, ?, JSON_ARRAY_PACK(?))")}`,
    flatData
  );

  console.log(`saved ${data.map((v) => `${v.transcription} - ${v.timestamp} | `).join("")} to the database`);
}
t