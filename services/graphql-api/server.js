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


// In-memory data store (Kode Anda, tidak berubah)
let posts = [
  {
    id: '1',
    title: 'Welcome to GraphQL',
    content: 'This is our first GraphQL post with subscriptions!',
    author: 'GraphQL Team',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Real-time Updates',
    content: 'Watch this space for real-time updates using GraphQL subscriptions.',
    author: 'Development Team',
    createdAt: new Date().toISOString(),
  }
];
let comments = [
  {
    id: '1',
    postId: '1',
    content: 'Great introduction to GraphQL!',
    author: 'John Doe',
    createdAt: new Date().toISOString(),
  }
];


// GraphQL type definitions (VERSI BERSIH TANPA KARAKTER SILUMAN)
const typeDefs = `
type Post {
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
  posts: [Post!]!
  post(id: ID!): Post
  comments(postId: ID!): [Comment!]!
}


type Mutation {
  createPost(title: String!, content: String!, author: String!): Post!
  updatePost(id: ID!, title: String, content: String): Post!
  deletePost(id: ID!): Boolean!
  createComment(postId: ID!, content: String!, author: String!): Comment!
  deleteComment(id: ID!): Boolean!
}


type Subscription {
  postAdded: Post!
  commentAdded: Comment!
  postUpdated: Post!
  postDeleted: ID!
}
`;


// GraphQL resolvers (Kode Anda, tidak berubah)
const resolvers = {
  Query: {
    posts: () => posts,
    post: (_, { id }) => posts.find(post => post.id === id),
    comments: (_, { postId }) => comments.filter(comment => comment.postId === postId),
  },


  Post: {
    comments: (parent) => comments.filter(comment => comment.postId === parent.id),
  },


  Mutation: {
    createPost: (_, { title, content, author }) => {
      const newPost = {
        id: uuidv4(),
        title,
        content,
        author,
        createdAt: new Date().toISOString(),
      };
      posts.push(newPost);
      pubsub.publish('POST_ADDED', { postAdded: newPost });
      return newPost;
    },


    updatePost: (_, { id, title, content }) => {
      const postIndex = posts.findIndex(post => post.id === id);
      if (postIndex === -1) { throw new Error('Post not found'); }
      const updatedPost = {
        ...posts[postIndex],
        ...(title && { title }),
        ...(content && { content }),
      };
      posts[postIndex] = updatedPost;
      pubsub.publish('POST_UPDATED', { postUpdated: updatedPost });
      return updatedPost;
    },


    deletePost: (_, { id }) => {
      const postIndex = posts.findIndex(post => post.id === id);
      if (postIndex === -1) { return false; }
      comments = comments.filter(comment => comment.postId !== id);
      posts.splice(postIndex, 1);
      pubsub.publish('POST_DELETED', { postDeleted: id });
      return true;
    },


    createComment: (_, { postId, content, author }) => {
      const post = posts.find(p => p.id === postId);
      if (!post) { throw new Error('Post not found'); }
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
    postAdded: {
      subscribe: () => pubsub.asyncIterator(['POST_ADDED']),
    },
    commentAdded: {
      subscribe: () => pubsub.asyncIterator(['COMMENT_ADDED']),
    },
    postUpdated: {
      subscribe: () => pubsub.asyncIterator(['POST_UPDATED']),
    },
    postDeleted: {
      subscribe: () => pubsub.asyncIterator(['POST_DELETED']),
    },
  },
};


// ===== FUNGSI startServer() BARU UNTUK v3 =====
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


// Health check endpoint (Kode Anda, tidak berubah)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'graphql-api',
    timestamp: new Date().toISOString(),
    data: {
      posts: posts.length,
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
