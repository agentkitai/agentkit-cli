export interface ServiceDefinition {
  name: string;
  description: string;
  defaultPort: number | null;
  healthEndpoint: string | null;
  dockerImage: string;
  dependencies: string[];
}

export const SERVICE_REGISTRY: Record<string, ServiceDefinition> = {
  agentlens: {
    name: "AgentLens",
    description: "Observability and monitoring for AI agents",
    defaultPort: 3000,
    healthEndpoint: "/api/health",
    dockerImage: "agentkit/agentlens:latest",
    dependencies: [],
  },
  lore: {
    name: "Lore",
    description: "Knowledge management and RAG pipeline",
    defaultPort: 3001,
    healthEndpoint: "/health",
    dockerImage: "agentkit/lore:latest",
    dependencies: [],
  },
  agentgate: {
    name: "AgentGate",
    description: "API gateway and rate limiting for agents",
    defaultPort: 3002,
    healthEndpoint: "/api/health",
    dockerImage: "agentkit/agentgate:latest",
    dependencies: [],
  },
  formbridge: {
    name: "FormBridge",
    description: "Form generation and data collection",
    defaultPort: 3003,
    healthEndpoint: "/api/health",
    dockerImage: "agentkit/formbridge:latest",
    dependencies: [],
  },
  agenteval: {
    name: "AgentEval",
    description: "Evaluation and benchmarking for AI agents",
    defaultPort: null,
    healthEndpoint: null,
    dockerImage: "agentkit/agenteval:latest",
    dependencies: [],
  },
};
