import {
  GetLabelDetectionCommand,
  RekognitionClient,
  StartLabelDetectionCommand,
} from "@aws-sdk/client-rekognition";
import fs from "node:fs/promises";

const REGION = "us-east-1";

const rekClient = new RekognitionClient({
  region: REGION,
  credentials: {
    accessKeyId: "",
    secretAccessKey: "",
  },
});

// Set bucket and video variables
const bucket = "bucketName";
const videoName = "video.extension";

const startLabelDetection = async () => {
  try {
    //Initiate label detection and update value of startJobId with returned Job ID
    const labelDetectionResponse = await rekClient.send(
      new StartLabelDetectionCommand({
        Video: { S3Object: { Bucket: bucket, Name: videoName } },
        Features: ["GENERAL_LABELS"],
        MinConfidence: 75,
      })
    );
    const startJobId = labelDetectionResponse.JobId;
    console.log(`JobID: ${startJobId}`);
    return startJobId;
  } catch (err) {
    console.log("Error", err);
  }
};

const getLabelDetectionResults = async (startJobId) => {
  console.log("Retrieving Label Detection results");
  // Set max results, paginationToken and finished will be updated depending on response values
  var maxResults = 10;
  var paginationToken = "";
  var finished = false;

  let body = { content: [] };
  while (finished == false) {
    var response = await rekClient.send(
      new GetLabelDetectionCommand({
        JobId: startJobId,
        MaxResults: maxResults,
        NextToken: paginationToken,
        SortBy: "TIMESTAMP",
      })
    );

    if (response.JobStatus === "IN_PROGRESS") {
      console.log("Detection is in progress");
      return;
    }
    // For every detected label, log label, confidence, bounding box, and timestamp
    response.Labels.forEach((labelDetection) => {
      var label = labelDetection.Label;
      let content = {};
      content.timestamp = labelDetection.Timestamp;
      content.label = label.Name;
      content.confidence = parseInt(label.Confidence);
      // Log parent if found
      content.parents = [];
      label.Parents.forEach((parent) => {
        content.parents.push(parent.Name);
      });
      body.content.push(content);
      // Searh for pagination token, if found, set variable to next token
      if (response.NextToken !== undefined && response.NextToken !== "") {
        paginationToken = response.NextToken;
      } else {
        finished = true;
      }
    });
  }
  await fs.appendFile("./input.json", JSON.stringify(body));
};

// startLabelDetection()
//   .then((startJobId) => {
//     console.log("Job Id: ", startJobId);
//   })
//   .catch((err) => {
//     console.error(err, err.stack);
//   });

// getLabelDetectionResults(
//   jobID
// )
//   .then(() => {
//     console.log("Done");
//   })
//   .catch((err) => {
//     console.error(err, err.stack);
//   });
