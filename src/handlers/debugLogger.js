// In-memory logger for production diagnostics
class DebugLogger {
    constructor() {
        this.events = [];
        this.errors = [];
        this.maxSize = 50;
    }

    logEvent(event) {
        this.events.unshift({
            timestamp: new Date().toISOString(),
            type: event.type,
            userId: event.source?.userId,
            message: event.message?.text || event.message?.type
        });
        if (this.events.length > this.maxSize) this.events.pop();
    }

    logError(context, error) {
        this.errors.unshift({
            timestamp: new Date().toISOString(),
            context: context,
            message: error.message,
            stack: error.stack?.substring(0, 300)
        });
        if (this.errors.length > this.maxSize) this.errors.pop();
    }

    getReport() {
        return {
            events: this.events,
            errors: this.errors
        };
    }
}

export const debugLogger = new DebugLogger();
