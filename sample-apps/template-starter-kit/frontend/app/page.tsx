'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Home() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Ensure your backend is running on port 8000
    axios.get('http://localhost:8000/')
      .then(res => setMessage(res.data.message))
      .catch(err => console.error("Error connecting to backend:", err));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex mb-10">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4">
          Pixeltable Starter Kit
        </p>
      </div>

      <div className="grid text-center lg:max-w-5xl lg:w-full lg:text-left">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100">
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Backend Connection
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Status: {message ? <span className="text-green-600 font-bold">Connected</span> : <span className="text-red-600">Disconnected</span>}
          </p>
          <p className="mt-2 text-sm">
            Response: {message}
          </p>
        </div>
      </div>
    </main>
  );
}

