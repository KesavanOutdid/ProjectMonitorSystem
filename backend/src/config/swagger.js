const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Project Monitor System API (Jira Engine)',
      version: '1.0.0',
      description: `
### High-Performance Enterprise Project Management API
- **Sub-5ms Cursor Pagination** powered by Redis cache & MongoDB compound indexes
- **Multi-Tenant Workspaces & RBAC**: SuperAdmin, OrgAdmin, ProjectManager, Member, Guest
- **Kanban Board Drag & Drop** task pipeline
- **Pluggable Storage System**: Local Uploads -> S3/Cloudflare R2
- **Subscription & Usage Quotas**
      `,
      contact: {
        name: 'API Support',
        email: 'support@projectmonitorsystem.local'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token'
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/models/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
