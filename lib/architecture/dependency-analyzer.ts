/**
 * Dependency Analyzer
 *
 * Analyzes and visualizes the dependency structure of the codebase
 * to identify circular dependencies and coupling issues.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

interface DependencyNode {
  id: string;
  path: string;
  imports: string[];
  exports: string[];
  type: 'component' | 'utility' | 'service' | 'config' | 'type';
}

interface CircularDependency {
  cycle: string[];
  severity: 'high' | 'medium' | 'low';
}

interface DependencyAnalysis {
  nodes: DependencyNode[];
  circularDependencies: CircularDependency[];
  couplingMetrics: {
    highCoupling: string[];
    looseCoupling: string[];
    averageCoupling: number;
  };
  recommendations: string[];
}

export class DependencyAnalyzer {
  private nodes: Map<string, DependencyNode> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();

  /**
   * Analyze dependencies in the given directory
   */
  async analyzeDependencies(rootDir: string): Promise<DependencyAnalysis> {
    await this.scanDirectory(rootDir);
    const circularDependencies = this.findCircularDependencies();
    const couplingMetrics = this.calculateCouplingMetrics();
    const recommendations = this.generateRecommendations(
      circularDependencies,
      couplingMetrics,
    );

    return {
      nodes: Array.from(this.nodes.values()),
      circularDependencies,
      couplingMetrics,
      recommendations,
    };
  }

  /**
   * Scan directory and build dependency graph
   */
  private async scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          await this.scanDirectory(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
        ) {
          await this.analyzeFile(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${dir}:`, error);
    }
  }

  /**
   * Analyze a single file for dependencies
   */
  private async analyzeFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(process.cwd(), filePath);
      const nodeId = this.getNodeId(relativePath);

      // Extract imports
      const imports = this.extractImports(content);
      const exports = this.extractExports(content);
      const type = this.determineFileType(relativePath, content);

      const node: DependencyNode = {
        id: nodeId,
        path: relativePath,
        imports,
        exports,
        type,
      };

      this.nodes.set(nodeId, node);

      // Build dependency graph
      if (!this.dependencyGraph.has(nodeId)) {
        this.dependencyGraph.set(nodeId, new Set());
      }

      imports.forEach((importPath) => {
        if (importPath.startsWith('@/')) {
          const resolvedPath = this.resolveImportPath(importPath, filePath);
          if (resolvedPath) {
            const importNodeId = this.getNodeId(resolvedPath);
            this.dependencyGraph.get(nodeId)?.add(importNodeId);
          }
        }
      });
    } catch (error) {
      console.warn(`Failed to analyze file ${filePath}:`, error);
    }
  }

  /**
   * Extract import statements from file content
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    let match: RegExpExecArray | null = importRegex.exec(content);

    while (match !== null) {
      const importPath = match[1];
      if (
        importPath.startsWith('@/') ||
        importPath.startsWith('./') ||
        importPath.startsWith('../')
      ) {
        imports.push(importPath);
      }
      match = importRegex.exec(content);
    }

    return imports;
  }

  /**
   * Extract export statements from file content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // Named exports
    const namedExportRegex =
      /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g;
    let match = namedExportRegex.exec(content);
    while (match !== null) {
      exports.push(match[1]);
      match = namedExportRegex.exec(content);
    }

    // Default exports
    if (content.includes('export default')) {
      exports.push('default');
    }

    // Re-exports
    const reExportRegex =
      /export\s+(?:\*|\{[^}]+\})\s+from\s+['"`]([^'"`]+)['"`]/g;
    match = reExportRegex.exec(content);
    while (match !== null) {
      exports.push(`re-export:${match[1]}`);
      match = reExportRegex.exec(content);
    }

    return exports;
  }

  /**
   * Determine file type based on path and content
   */
  private determineFileType(
    filePath: string,
    content: string,
  ): DependencyNode['type'] {
    if (filePath.includes('/components/')) return 'component';
    if (filePath.includes('/config/') || filePath.endsWith('.config.ts'))
      return 'config';
    if (
      filePath.includes('/types/') ||
      content.includes('export interface') ||
      content.includes('export type')
    )
      return 'type';
    if (filePath.includes('/utils/') || filePath.includes('/helpers/'))
      return 'utility';
    return 'service';
  }

  /**
   * Resolve import path to actual file path
   */
  private resolveImportPath(
    importPath: string,
    fromFile: string,
  ): string | null {
    if (importPath.startsWith('@/')) {
      // Resolve alias imports
      const resolved = importPath.replace('@/', '');
      return resolved;
    } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Resolve relative imports
      const fromDir = path.dirname(fromFile);
      const resolved = path.resolve(fromDir, importPath);
      return path.relative(process.cwd(), resolved);
    }

    return null;
  }

  /**
   * Get node ID from file path
   */
  private getNodeId(filePath: string): string {
    return filePath.replace(/\.(ts|tsx)$/, '').replace(/\//g, '.');
  }

  /**
   * Find circular dependencies using DFS
   */
  private findCircularDependencies(): CircularDependency[] {
    const circularDeps: CircularDependency[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const pathStack: string[] = [];

    const dfs = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = pathStack.indexOf(nodeId);
        const cycle = pathStack.slice(cycleStart).concat(nodeId);
        const severity = this.calculateCircularDependencySeverity(cycle);
        circularDeps.push({ cycle, severity });
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recStack.add(nodeId);
      pathStack.push(nodeId);

      const dependencies = this.dependencyGraph.get(nodeId) || new Set();
      for (const depId of dependencies) {
        if (dfs(depId)) {
          // Cycle found, but continue to find all cycles
        }
      }

      recStack.delete(nodeId);
      pathStack.pop();
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return circularDeps;
  }

  /**
   * Calculate severity of circular dependency
   */
  private calculateCircularDependencySeverity(
    cycle: string[],
  ): 'high' | 'medium' | 'low' {
    // Check if cycle involves critical modules
    const criticalModules = ['db', 'auth', 'config'];
    const hasCriticalModule = cycle.some((nodeId) =>
      criticalModules.some((critical) => nodeId.includes(critical)),
    );

    if (hasCriticalModule && cycle.length <= 3) {
      return 'high';
    } else if (cycle.length <= 4) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Calculate coupling metrics
   */
  private calculateCouplingMetrics(): DependencyAnalysis['couplingMetrics'] {
    const couplingScores = new Map<string, number>();

    for (const [nodeId, dependencies] of this.dependencyGraph) {
      const incomingCount = this.getIncomingDependencies(nodeId).length;
      const outgoingCount = dependencies.size;
      const couplingScore = incomingCount + outgoingCount;
      couplingScores.set(nodeId, couplingScore);
    }

    const scores = Array.from(couplingScores.values());
    const averageCoupling =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const sortedByScore = Array.from(couplingScores.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    const highCoupling = sortedByScore
      .filter(([, score]) => score > averageCoupling * 1.5)
      .map(([nodeId]) => nodeId);

    const looseCoupling = sortedByScore
      .filter(([, score]) => score < averageCoupling * 0.5)
      .map(([nodeId]) => nodeId);

    return {
      highCoupling,
      looseCoupling,
      averageCoupling: Math.round(averageCoupling * 100) / 100,
    };
  }

  /**
   * Get incoming dependencies for a node
   */
  private getIncomingDependencies(targetNodeId: string): string[] {
    const incoming: string[] = [];

    for (const [nodeId, dependencies] of this.dependencyGraph) {
      if (dependencies.has(targetNodeId)) {
        incoming.push(nodeId);
      }
    }

    return incoming;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    circularDeps: CircularDependency[],
    couplingMetrics: DependencyAnalysis['couplingMetrics'],
  ): string[] {
    const recommendations: string[] = [];

    // Circular dependency recommendations
    if (circularDeps.length > 0) {
      const highSeverity = circularDeps.filter(
        (cd) => cd.severity === 'high',
      ).length;
      if (highSeverity > 0) {
        recommendations.push(
          `Fix ${highSeverity} high-severity circular dependencies immediately`,
        );
      }

      if (circularDeps.length > highSeverity) {
        recommendations.push(
          `Address ${circularDeps.length - highSeverity} remaining circular dependencies`,
        );
      }
    }

    // Coupling recommendations
    if (couplingMetrics.highCoupling.length > 0) {
      recommendations.push(
        `Refactor ${couplingMetrics.highCoupling.length} highly coupled modules`,
      );
      recommendations.push(
        'Consider implementing dependency injection or facade patterns',
      );
    }

    if (couplingMetrics.averageCoupling > 10) {
      recommendations.push(
        'Overall coupling is high - consider architectural refactoring',
      );
    }

    // Specific module recommendations
    const dbModules = couplingMetrics.highCoupling.filter((nodeId) =>
      nodeId.includes('db'),
    );
    if (dbModules.length > 0) {
      recommendations.push(
        'Create database abstraction layer to reduce coupling',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Dependency structure looks good - maintain current architecture',
      );
    }

    return recommendations;
  }

  /**
   * Export dependency graph as DOT format for visualization
   */
  exportToDot(): string {
    let dot = 'digraph Dependencies {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';

    // Add nodes with colors based on type
    for (const node of this.nodes.values()) {
      const color = this.getNodeColor(node.type);
      dot += `  "${node.id}" [label="${node.id}\\n(${node.type})" fillcolor="${color}" style=filled];\n`;
    }

    dot += '\n';

    // Add edges
    for (const [nodeId, dependencies] of this.dependencyGraph) {
      for (const depId of dependencies) {
        dot += `  "${nodeId}" -> "${depId}";\n`;
      }
    }

    dot += '}';
    return dot;
  }

  /**
   * Get color for node type
   */
  private getNodeColor(type: DependencyNode['type']): string {
    const colors = {
      component: 'lightblue',
      service: 'lightgreen',
      utility: 'lightyellow',
      config: 'lightcoral',
      type: 'lightgray',
    };
    return colors[type] || 'white';
  }
}

// Export singleton instance
export const dependencyAnalyzer = new DependencyAnalyzer();
