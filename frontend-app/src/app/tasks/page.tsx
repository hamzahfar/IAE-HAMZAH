'use client';

import { useState, useEffect } from 'react';

const GET_TASKS_QUERY = `
  query GetTasks {
    tasks {
      id
      title
      content
      author
      createdAt
    }
  }
`;

const CREATE_TASK_QUERY = `
  mutation CreateTask($title: String!, $content: String!, $author: String!) {
    createTask(title: $title, content: $content, author: $author) {
      id
      title
      content
      author
      createdAt
    }
  }
`;

// === TAMBAHKAN MUTASI DELETE ===
const DELETE_TASK_MUTATION = `
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`;
// =============================

// Definisikan tipe untuk user agar TypeScript senang
interface User {
  username: string;
  role: string; // <-- TAMBAHKAN ROLE
}

// Tipe data untuk Task
interface Task {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export default function TasksPage() {
  const [newTask, setNewTask] = useState({ title: '', content: '' });
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State untuk simulasi navigasi di preview
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // URL API dari environment
  const GQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || '/graphql';

  // Fungsi helper untuk fetch GraphQL
  const fetchGraphQL = async (query: string, variables: Record<string, any> = {}) => {
    const token = localStorage.getItem('token');
    
    const res = await fetch(GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    // Cek jika response BUKAN ok
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Token tidak valid, logout user
        handleLogout();
      }
      // Coba baca error dari body
      try {
        const errorBody = await res.json();
        if (errorBody.errors && errorBody.errors[0]) {
          throw new Error(errorBody.errors[0].message);
        } else {
          throw new Error(`GraphQL request failed with status ${res.status}`);
        }
      } catch (e: any) {
        // Fallback jika body bukan JSON atau error parsing lain
        throw new Error(e.message || `GraphQL request failed with status ${res.status}`);
      }
    }
    
    const responseBody = await res.json();
    
    // Cek error GraphQL di body response
    if (responseBody.errors && responseBody.errors[0]) {
      throw new Error(responseBody.errors[0].message);
    }
    
    return responseBody;
  };

  // 3. Pengecekan Otorisasi/Login saat halaman dimuat
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      setIsLoggedIn(false);
      
    } else {
      try {
        setUser(JSON.parse(storedUser));
        setIsLoggedIn(true);
      } catch (e) {
        console.error("Gagal parse data user, paksa login ulang");
        localStorage.clear();
        setIsLoggedIn(false);
      }
    }
  }, []); // Hanya dijalankan sekali saat mount

  // Efek untuk fetch data HANYA jika sudah login
  useEffect(() => {
    if (isLoggedIn) {
      fetchTasks();
    }
  }, [isLoggedIn]); // Dijalankan saat status login berubah

  // Fungsi untuk mengambil data tasks
  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchGraphQL(GET_TASKS_QUERY);
      if (response.data?.tasks) {
        setTasks(response.data.tasks);
      }
    } catch (err: any) {
      setError(err.message || "Gagal memuat tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null); // Bersihkan error

    try {
      await fetchGraphQL(CREATE_TASK_QUERY, {
        title: newTask.title,
        content: newTask.content,
        author: user.username
      });
      setNewTask({ title: '', content: '' });
      fetchTasks(); // Ambil ulang data tasks
    } catch (err: any) {
      console.error('Error creating task:', err);
      setError(err.message || "Gagal membuat task");
    }
  };

  // === TAMBAHKAN FUNGSI DELETE ===
  const handleDeleteTask = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus task ini?')) {
      return;
    }

    setError(null); // Bersihkan error sebelumnya
    try {
      await fetchGraphQL(DELETE_TASK_MUTATION, { id });
      fetchTasks(); // Ambil ulang data tasks setelah menghapus
    } catch (err: any) {
      console.error('Error deleting task:', err);
      // Tampilkan error ke pengguna jika gagal (karena ForbiddenError)
      setError(err.message || "Gagal menghapus task");
    }
  };
  // ===============================

  // 5. handleLogout yang sudah diperbarui
  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setUser(null);
    // Di aplikasi Next.js asli, kita akan menggunakan router.push('/login')
  };

  // 6. Tampilkan pesan jika belum login (untuk mode preview)
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white shadow rounded-lg">
          <p className="text-xl text-red-600">Anda harus login untuk mengakses halaman ini.</p>
          <p className="mt-4">Ini adalah halaman Task Management.</p>
          <p>(Di aplikasi aslinya, Anda akan otomatis diarahkan ke halaman Login)</p>
        </div>
      </div>
    );
  }

  // Tampilkan loading jika user sudah login tapi data belum siap
  if (!user) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p>Loading user...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header dan Tombol Logout */}
        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-gray-800">Task Management</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Welcome, {user.username}</span>
            <button 
              onClick={handleLogout} 
              className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Form Create Task */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-semibold mb-4">Add New Task</h2>
          <form onSubmit={handleCreateTask} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Task Title"
              className="border p-2 rounded w-full"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              required
            />
            <textarea
              placeholder="Task Description"
              className="border p-2 rounded w-full h-24"
              value={newTask.content}
              onChange={(e) => setNewTask({ ...newTask, content: e.target.value })}
              required
            />
            <button type="submit" className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 self-start px-6">
              Create Task
            </button>
          </form>
        </div>

        {/* Task List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-700">Your Tasks</h2>
          
          {/* Tampilkan status loading atau error */}
          {loading && <p>Loading tasks...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}
          
          {/* 7. Render data tasks dari state */}
          {tasks.map((task: Task) => (
            <div key={task.id} className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
              <h3 className="text-lg font-bold text-gray-800">{task.title}</h3>
              <p className="text-gray-600 mt-2">{task.content}</p>
              
              {/* === PERUBAHAN DI SINI === */}
              <div className="mt-4 flex justify-between items-center text-sm text-gray-400">
                <span>Assigned to: {task.author}</span>
                <div className="flex items-center gap-4">
                  <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                  
                  {/* TOMBOL HAPUS KONDISIONAL */}
                  {user && user.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {/* ======================== */}
            </div>
          ))}

          {/* Tampilkan jika tidak ada task */}
          {!loading && tasks.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
              <p>No tasks found. Create one above!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}