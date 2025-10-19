import { Application } from './Application';

async function main(): Promise<void> {
  const app = new Application();
  await app.start();
}

main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});