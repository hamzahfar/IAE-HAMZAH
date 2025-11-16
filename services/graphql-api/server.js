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

app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:3002', 
    'http://api-gateway:3000', 
    'http://frontend-app:3002' 
  ],
  credentials: true
}));

let tasks = [ 
  {
    id: '1',
    title: 'Learn GraphQL Subscriptions',
    content: 'Implement real-time updates for the task list.',
    author: 'johndoe', 
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
    postId: '1', 
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

  const server = new ApolloServer({
    schema, 
    context: ({ req }) => {
      return { req };
    },
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),


      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
     
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

  await server.start();
 
  server.applyMiddleware({ app, path: '/graphql' });


  const PORT = process.env.PORT || 4000;

  httpServer.listen(PORT, () => {
    console.log(`🚀 GraphQL API Server running on port ${PORT}`);
    console.log(`🔗 GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`📡 Subscriptions ready at ws://localhost:${PORT}${server.graphqlPath}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
      console.log('Process terminated');
    });
  });
}

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'graphql-api',
    timestamp: new Date().toISOString(),
    data: {
      tasks: tasks.length, 
      comments: comments.length
    }
  });
});

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

startServer().catch(error => {
  console.error('Failed to start GraphQL server:', error);
  process.exit(1);
});