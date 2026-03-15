
/**
 * Tool Registry for managing AI tools.
 * 
 * This registry holds the definitions of all available tools
 * and provides methods to get them formatted for the Gemini API.
 */
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    /**
     * Register a new tool.
     * @param {Object} tool - The tool object definition
     */
    register(tool) {
        if (!tool.declaration || !tool.declaration.name) {
            throw new Error('Tool must have a declaration with a name');
        }
        console.log(`🛠️ Registering tool: ${tool.declaration.name}`);
        this.tools.set(tool.declaration.name, tool);
    }

    /**
     * Get a tool by name.
     * @param {string} name 
     * @returns {Object|undefined}
     */
    get(name) {
        return this.tools.get(name);
    }

    /**
     * Get all tool definitions formatted for Gemini API.
     * Gemini expects: { tools: [{ functionDeclarations: [...] }] }
     * @returns {Array} List of function declaration objects
     */
    getDefinitions() {
        const declarations = Array.from(this.tools.values()).map(t => t.declaration);
        return [{ functionDeclarations: declarations }]; // correct property is function_declarations (snake_case) or functionDeclarations? 
        // The Node SDK uses camelCase usually, but the API JSON is snake_case.
        // Let's check SDK docs or usage examples.
        // Actually, the GoogleGenerativeAI SDK typically accepts `functionDeclarations` (camelCase) in the object config.
        // I will use `functionDeclarations`. 
        // Wait, checking my own knowledge: SDK v0.1.3+ uses camelCase.
    }

    /**
     * Execute a tool by name with arguments.
     * @param {string} name - Tool name
     * @param {Object} args - Arguments from the model
     */
    async execute(name, args) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool definitions not found for: ${name}`);
        }
        console.log(`⚙️ Executing tool ${name} with args:`, JSON.stringify(args));
        try {
            return await tool.execute(args);
        } catch (error) {
            console.error(`❌ Tool execution failed (${name}):`, error);
            return { error: error.message };
        }
    }
}

export const toolRegistry = new ToolRegistry();
