import startOfToday from 'date-fns/startOfToday'
import startOfYesterday from 'date-fns/startOfYesterday'
import format from 'date-fns/format'
import formatDuration from 'date-fns/formatDuration'
import intervalToDuration from 'date-fns/intervalToDuration'

import { Client } from '@elastic/elasticsearch'
const client = new Client({ node: 'http://localhost:9200' })

import { WebClient } from '@slack/web-api'

function isPositiveLike(element, index, array) { 
  return (element.sentiment === 'LIKE'); 
} 

async function run() {
  const indexName = 'prod-feedback'

  const feedbackWindowStart = startOfYesterday()
  const feedbackWindowEnd = startOfToday();
  
  const documents = await client.helpers.search({
    index: indexName,
    body: {
      // we'll use from/size to try to fit everything into a single request.
      from: 0,
      size: 500,
      query: {
        range: {
          date: {
            gte: feedbackWindowStart,
            lte: feedbackWindowEnd
          }
        }
      }
      }
  })
  
  const establishments = documents.map(document => document['establishment'])
  const uniqueEstablishments = [...new Set(establishments)]

  const feedbackWindowDuration = intervalToDuration({
    start: feedbackWindowStart,
    end: feedbackWindowEnd
  })

  console.log(`Feedback from ${format(feedbackWindowStart, 'dd/MM/yyyy')} to ${format(feedbackWindowEnd, 'dd/MM/yyyy')} (${formatDuration(feedbackWindowDuration)})`)
  console.log('------------')
  
  uniqueEstablishments.forEach(establishment => {
    const establishmentFeedbackDocuments = documents.filter(document => document['establishment'] === establishment)
    const positiveCount = establishmentFeedbackDocuments.filter(isPositiveLike).length
    const percentagePositive = (positiveCount / establishmentFeedbackDocuments.length) * 100
    console.log(`${establishment}: ${percentagePositive.toFixed(1)}% positive of ${establishmentFeedbackDocuments.length} responses`)
  })

  const establishmentStats = uniqueEstablishments.map(establishment => {
    const establishmentFeedbackDocuments = documents.filter(document => document['establishment'] === establishment)
    
    const positiveCount = establishmentFeedbackDocuments.filter(isPositiveLike).length
    const totalCount = establishmentFeedbackDocuments.length
    const percentagePositive = ((positiveCount / establishmentFeedbackDocuments.length) * 100).toFixed(1)

    return {
      name: establishment,
      positiveCount,
      totalCount,
      percentagePositive
    }
  })

  const overallPositiveCount = documents.filter(isPositiveLike).length
  const overallTotalCount = documents.length
  const overallPercentagePositive = (overallPositiveCount / documents.length) * 100
    
  console.log('------------')
  console.log(`Overall: ${overallPercentagePositive.toFixed(1)}% positive of ${documents.length} responses`)

  await postToSlack(feedbackWindowStart, feedbackWindowEnd, feedbackWindowDuration, establishmentStats, overallTotalCount, overallPercentagePositive);
  return documents
}

async function postToSlack(feedbackWindowStart, feedbackWindowEnd, feedbackWindowDuration, establishmentStats, overallTotalCount, overallPercentagePositive) {

  // An access token (from your Slack app or custom integration - xoxp, xoxb)
  const token = process.env.SLACK_TOKEN

  const web = new WebClient(token)
  const formattedEstablishmentStats =  establishmentStats.map(establishment => `- ${establishment['name']}: ${establishment['percentagePositive']}% 👍 (of ${establishment['totalCount']})`)

  ;(async () => {
    // See: https://api.slack.com/methods/chat.postMessage
    const res = await web.chat.postMessage({ 
      channel: '#slackbot-test', 
      text: `Feedback from ${format(feedbackWindowStart, 'dd/MM/yyyy')} to ${format(feedbackWindowEnd, 'dd/MM/yyyy')} (${formatDuration(feedbackWindowDuration)})
${formattedEstablishmentStats.join("\n")}
------------
Overall:
*${overallPercentagePositive}% positive* of ${overallTotalCount} responses
      ` 
    });

    // `res` contains information about the posted message
    console.log('Message sent: ', res.ts);
  })();
}

run()