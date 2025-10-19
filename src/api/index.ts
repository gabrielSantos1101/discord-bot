// REST API Service entry point
export * from './routes/configRoutes';
export * from './routes/userRoutes';
export * from './server';

// Re-export for convenience
export { ApiServer } from './server';
