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
    dockerImage: "ghcr.io/agentkitai/agentlens:latest",
    dependencies: [],
  },
  lore: {
    name: "Lore",
    description: "Knowledge management and RAG pipeline",
    defaultPort: 8765,
    healthEndpoint: "/health",
    dockerImage: "ghcr.io/agentkitai/lore:latest",
    dependencies: [],
  },
  agentgate: {
    name: "AgentGate",
    description: "API gateway and rate limiting for agents",
    defaultPort: 3002,
    healthEndpoint: "/api/health",
    dockerImage: "ghcr.io/agentkitai/agentgate:latest",
    dependencies: [],
  },
  formbridge: {
    name: "FormBridge",
    description: "Form generation and data collection",
    defaultPort: 3003,
    healthEndpoint: "/api/health",
    dockerImage: "ghcr.io/agentkitai/formbridge:latest",
    dependencies: [],
  },
  agenteval: {
    name: "AgentEval",
    description: "Evaluation and benchmarking for AI agents",
    defaultPort: null,
    healthEndpoint: null,
    dockerImage: "ghcr.io/agentkitai/agenteval:latest",
    dependencies: [],
  },
};
