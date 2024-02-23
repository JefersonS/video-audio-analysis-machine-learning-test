const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const { Client } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");

exports.handler = async (event, _context) => {
  if (!event["queryStringParameters"] || !event["queryStringParameters"]["q"]) {
    return {
      statusCode: 400,
      message: "please inform a query to be performed",
    };
  }

  const searchText = event["queryStringParameters"]["q"];

  const client = new Client({
    ...AwsSigv4Signer({
      region: "us-east-1",
      service: "es",
      getCredentials: () => {
        const credentialsProvider = defaultProvider();
        return credentialsProvider();
      },
    }),
    requestTimeout: 60000,
    node: "elastic-search-endpoint",
  });

  var query = {
    query: {
      query_string: {
        fields: ["", "", ""],
        query: searchText,
      },
    },
    _source: "{_id}",
  };

  var response = await client.search({
    index: "",
    body: query,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      response: response.body.hits,
    }),
  };
};
