// ===== IMPOR LAMA ANDA =====
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { PubSub } = require('graphql-subscriptions');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');


// ===== IMPOR BARU UNTUK APOLLO v3 + SUBSCRIPTIONS =====
const { createServer } = require('http');
const { ApolloServerPluginDrainHttpServer } = require('apollo-server-core');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
// ===================================================


const app = express();
const pubsub = new PubSub();


// Enable CORS (Kode Anda, tidak berubah)
app.use(cors({
  origin: [
    'http://localhost:3000', // API Gateway
    'http://localhost:3002', // Frontend
    'http://api-gateway:3000', // Docker container name
    'http://frontend-app:3002' // Docker container name
  ],
  credentials: true
}));


// --- In-memory data store (DIGANTI DARI POSTS MENJADI TASKS) ---
let tasks = [ // Ganti nama 'posts' menjadi 'tasks'
  {
    id: '1',
    title: 'Learn GraphQL Subscriptions',
    content: 'Implement real-time updates for the task list.',
    author: 'johndoe', // Sesuaikan dengan user Anda
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Implement JWT Security',
    content: 'Secure all endpoints using JWT and public/private keys.',
    author: 'johndoe',
    createdAt: new Date().toISOString(),
  }
];
let comments = [
  {
    id: '1',
    postId: '1', // Biarkan ini, atau bisa Anda hapus jika fitur comment tidak relevan
    content: 'This is a high priority task!',
    author: 'Jane Smith',
    createdAt: new Date().toISOString(),
  }
];


// --- GraphQL type definitions (DIGANTI DARI POST MENJADI TASK) ---
const typeDefs = `
type Task {
  id: ID!
  title: String!
  content: String!
  author: String!
  createdAt: String!
  comments: [Comment!]!
}

type Comment {
  id: ID!
  postId: ID!
  content: String!
  author: String!
  createdAt: String!
}

type Query {
  tasks: [Task!]!
  task(id: ID!): Task
  comments(postId: ID!): [Comment!]!
}

type Mutation {
  createTask(title: String!, content: String!, author: String!): Task!
  updateTask(id: ID!, title: String, content: String): Task!
  deleteTask(id: ID!): Boolean!
  
  # (Fitur comment bisa Anda hapus jika tidak diperlukan untuk Task Management)
  createComment(postId: ID!, content: String!, author: String!): Comment!
  deleteComment(id: ID!): Boolean!
}

type Subscription {
  taskAdded: Task!
  commentAdded: Comment!
  taskUpdated: Task!
  taskDeleted: ID!
}
`;


// --- GraphQL resolvers (DIGANTI DARI POST MENJADI TASK) ---
const resolvers = {
  Query: {
    tasks: () => tasks,
    task: (_, { id }) => tasks.find(task => task.id === id),
    comments: (_, { postId }) => comments.filter(comment => comment.postId === postId),
  },

  Task: { // Ganti 'Post' menjadi 'Task'
    comments: (parent) => comments.filter(comment => comment.postId === parent.id),
  },

  Mutation: {
    createTask: (_, { title, content, author }) => {
      const newTask = {
        id: uuidv4(),
        title,
        content,
        author,
        createdAt: new Date().toISOString(),
      };
      tasks.push(newTask);
      pubsub.publish('TASK_ADDED', { taskAdded: newTask });
      return newTask;
    },

    updateTask: (_, { id, title, content }) => {
      const taskIndex = tasks.findIndex(task => task.id === id);
      if (taskIndex === -1) { throw new Error('Task not found'); }
      const updatedTask = {
        ...tasks[taskIndex],
        ...(title && { title }),
        ...(content && { content }),
      };
      tasks[taskIndex] = updatedTask;
      pubsub.publish('TASK_UPDATED', { taskUpdated: updatedTask });
      return updatedTask;
    },

    deleteTask: (_, { id }) => {
      const taskIndex = tasks.findIndex(task => task.id === id);
      if (taskIndex === -1) { return false; }
      // Hapus juga komen yang terkait (jika ada)
      comments = comments.filter(comment => comment.postId !== id);
      tasks.splice(taskIndex, 1);
      pubsub.publish('TASK_DELETED', { taskDeleted: id });
      return true;
    },

    // --- Resolvers comment (biarkan atau hapus) ---
    createComment: (_, { postId, content, author }) => {
      const post = tasks.find(p => p.id === postId); // Cek di 'tasks'
      if (!post) { throw new Error('Task (Post) not found'); }
      const newComment = {
        id: uuidv4(),
        postId,
        content,
        author,
        createdAt: new Date().toISOString(),
      };
      comments.push(newComment);
      pubsub.publish('COMMENT_ADDED', { commentAdded: newComment });
      return newComment;
    },
    deleteComment: (_, { id }) => {
      const commentIndex = comments.findIndex(comment => comment.id === id);
      if (commentIndex === -1) { return false; }
      comments.splice(commentIndex, 1);
      return true;
    },
  },

  Subscription: {
    taskAdded: {
      subscribe: () => pubsub.asyncIterator(['TASK_ADDED']),
    },
    commentAdded: {
      subscribe: () => pubsub.asyncIterator(['COMMENT_ADDED']),
    },
    taskUpdated: {
      subscribe: () => pubsub.asyncIterator(['TASK_UPDATED']),
    },
    taskDeleted: {
      subscribe: () => pubsub.asyncIterator(['TASK_DELETED']),
    },
  },
};


// ===== FUNGSI startServer() BARU UNTUK v3 (Tidak berubah dari sebelumnya) =====
async function startServer() {
  // Buat 'schema' (gabungan typeDefs dan resolvers)
  const schema = makeExecutableSchema({ typeDefs, resolvers });


  // Buat HTTP server (dasar dari Express)
  const httpServer = createServer(app);


  // Buat server WebSocket
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql', // Path harus SAMA dengan Apollo Server
  });


  // Siapkan 'cleanup' handler untuk WebSocket menggunakan 'graphql-ws'
  const serverCleanup = useServer({ schema }, wsServer);


  // Buat Apollo Server
  const server = new ApolloServer({
    schema, // Gunakan schema yang sudah dibuat
    context: ({ req }) => {
      return { req };
    },
    plugins: [
      // Plugin #1: Untuk mematikan httpServer dengan benar
      ApolloServerPluginDrainHttpServer({ httpServer }),


      // Plugin #2: Untuk mematikan WebSocket server dengan benar
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
     
      // Plugin #3: Logger Anda yang lama
      {
        requestDidStart() {
          return {
            willSendResponse(requestContext) {
              console.log(`GraphQL ${requestContext.request.operationName || 'Anonymous'} operation completed`);
            },
          };
        },
      },
    ],
  });


  // Mulai server Apollo
  await server.start();
 
  // Terapkan middleware Express ke Apollo
  server.applyMiddleware({ app, path: '/graphql' });


  const PORT = process.env.PORT || 4000;


  // Jalankan servernya!
  // Kita .listen() di 'httpServer', BUKAN 'app'
  httpServer.listen(PORT, () => {
    console.log(`🚀 GraphQL API Server running on port ${PORT}`);
    console.log(`🔗 GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`📡 Subscriptions ready at ws://localhost:${PORT}${server.graphqlPath}`);
  });


  // Graceful shutdown (Kode Anda, tidak berubah)
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
      console.log('Process terminated');
    });
  });
}
// =============================================


// Health check endpoint (DIGANTI DARI POSTS MENJADI TASKS)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'graphql-api',
    timestamp: new Date().toISOString(),
    data: {
      tasks: tasks.length, // Ganti 'posts' menjadi 'tasks'
      comments: comments.length
    }
  });
});


// Error handling (Kode Anda, tidak berubah)
app.use((err, req, res, next) => {
/**
 * @deprecated
 */
  console.error('GraphQL API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});


// Start server (Kode Anda, tidak berubah)
startServer().catch(error => {
  console.error('Failed to start GraphQL server:', error);
  process.exit(1);
});