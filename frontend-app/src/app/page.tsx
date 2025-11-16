'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Cek apakah ada token di localStorage
    const token = localStorage.getItem('token');
    
    if (token) {
      // Jika ada token, arahkan ke halaman tasks
      router.push('/tasks');
    } else {
      // Jika tidak ada token, arahkan ke halaman login
      router.push('/login');
    }
  }, [router]); // Tambahkan router sebagai dependency

  // Tampilkan loading sementara redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p>Loading...</p>
    </div>
  );
}