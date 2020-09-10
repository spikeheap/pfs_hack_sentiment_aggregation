
This is a hackday project to aggregate sentiment and push it to a Slack channel

## Running the project 

```bash
npm install
SLACK_TOKEN=XXXXXXXX ts-node index.ts
```

## Environment variables

- `SLACK_TOKEN`, the webhook token used to post to Slack