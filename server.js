import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    appName: 'L.e.a. Ecolene Group Management Portal',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Firebase Web Public Config Endpoint (fallback for client runtime)
app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDZ2EvkIQDpa2dVbU2Pd0sJiLPK-ScnDu4',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'admin-lea.firebaseapp.com',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'admin-lea',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'admin-lea.firebasestorage.app',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '970310201053',
    appId: process.env.VITE_FIREBASE_APP_ID || '1:970310201053:web:0c0e33ceab188f9f7df534',
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-N21JQPF0Z2'
  });
});

// Fallback route to serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  L.e.a. Ecolene Group Management Server Running`);
    console.log(`  Port: http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
  });
}

export default app;
