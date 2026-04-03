import { Kafka, Producer, Consumer } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'gitlawb-ai',
  brokers: [process.env.KAFKA_BROKER || '127.0.0.1:9092'],
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: 'gitlawb-group' });

export async function sendToKafka(topic: string, message: any) {
  try {
    await producer.connect();
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    return `✅ Message sent to Kafka topic: ${topic}`;
  } catch (err: any) {
    throw new Error(`Kafka Send Error: ${err.message}`);
  }
}
