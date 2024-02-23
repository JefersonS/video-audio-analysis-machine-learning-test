import fs from "fs";
import mysql from "mysql2/promise";
import OpenAI from "openai";

//Modify the connection details to match the details specified while
//deploying the SingleStore workspace:
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

    const input = getInputData();
    const data = input.content;
    let aggregatedInputs = [];
    for (let i = 0; i < data.length; i++) {
      const dbData = {};
      dbData.label = data[i].label;
      dbData.timestamp = data[i].timestamp;
      aggregatedInputs.push(dbData);
      // not pretty but works as a batch to not hit the rate limit
      if (aggregatedInputs.length === 20 || data.length < i + 20) {
        const embeddings = await getEmbeddings(aggregatedInputs.map((input) => input.label));
        aggregatedInputs = aggregatedInputs.map((input, index) => {
          input.vector = embeddings[index];
          return input;
        });
        await insertEmbedding(connection, aggregatedInputs, "");
        aggregatedInputs = [];
        console.log(`Finished processing ${i + 1} of ${data.length} items`);
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

function getInputData() {
  const file = fs.readFileSync("input.json");
  return JSON.parse(file.toString());
}

async function getEmbeddings(data) {
  const openai = new OpenAI({
    apiKey: "your-api-key-here",
  });
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: data,
    encoding_format: "float",
  });

  return embedding.data.map((item) => item.embedding);
}

async function insertEmbedding(connection, data, video) {
  // flat values for the insert statement
  const flatData = data.reduce((acc, item) => {
    acc.push(item.label, video, item.timestamp, JSON.stringify(item.vector));
    return acc;
  }, []);

  const [rows] = await connection.execute(
    `INSERT INTO videos (label, video, timestamp, vector) VALUES ${data.map((v) => "(?, ?, ?, JSON_ARRAY_PACK(?))")}`,
    flatData
  );

  console.log(`saved ${data.map((v) => `${v.label} - ${v.timestamp} | `).join("")} to the database`);
}
