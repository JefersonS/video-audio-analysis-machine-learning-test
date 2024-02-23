const mysql = require("mysql2/promise");
const OpenAI = require("openai");
const fs = require("fs");

const HOST = "singleStoreAddress";
const PORT = 3333;
const USER = "";
const PASSWORD = "";
const DATABASE = "";

exports.handler = async (event, _context) => {
  if (!event["queryStringParameters"] || !event["queryStringParameters"]["q"]) {
    return {
      statusCode: 400,
      message: "please inform the required params",
    };
  }

  const connection = await getOpenStoreConnection();
  const searchText = event["queryStringParameters"]["q"];
  const embedding = await getEmbedding(searchText);
  const results = await querySingleStore(connection, embedding);
  await connection.end();

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type,hx-target,hx-context",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    body: JSON.stringify({
      results,
      query: searchText,
    }),
  };
};

async function getOpenStoreConnection() {
  try {
    const singleStoreConnection = await mysql.createConnection({
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

async function getEmbedding(data) {
  const openai = new OpenAI({
    apiKey: "your-api-key-here",
  });
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: data,
    encoding_format: "float",
  });

  return embedding.data[0].embedding;
}

async function querySingleStore(connection, embedding) {
  const [videos] = await connection.execute(
    "SELECT video, dot_product(vector, JSON_ARRAY_PACK(?)) AS score FROM videos WHERE score > 0.7 GROUP BY video ORDER BY score DESC",
    [JSON.stringify(embedding)]
  );

  const [transcriptions] = await connection.execute(
    "SELECT video, dot_product(vector, JSON_ARRAY_PACK(?)) AS score FROM transcriptions WHERE score > 0.4 GROUP BY video ORDER BY score DESC",
    [JSON.stringify(embedding)]
  );

  let response = [];
  if (videos.length > 0 && videos.length > transcriptions.length) {
    response = videos.map((video) => {
      const transcription = transcriptions.find((transcription) => transcription.video === video.video);
      return {
        video: video.video,
        videoScore: video.score,
        transcriptionScore: transcription ? transcription.score : null,
      };
    });
  } else if (transcriptions.length > 0 && transcriptions.length > videos.length) {
    response = transcriptions.map((transcription) => {
      const video = videos.find((video) => video.video === transcription.video);
      return {
        video: transcription.video,
        videoScore: video ? video.score : null,
        transcriptionScore: transcription.score,
      };
    });
  }

  return response;
}
