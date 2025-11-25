import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './WorkflowEditor.css';
import { api } from '../api';

const nodeTypes = {
  userInput: UserInputNode,
  modelNode: ModelNode,
  instructionNode: InstructionNode,
  mergeNode: MergeNode,
  branchNode: BranchNode,
  outputNode: OutputNode,
};

export default function WorkflowEditor({ config, theme }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState({});
  const [nodeStates, setNodeStates] = useState({});
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  useEffect(() => {
    loadModels();
    loadPersonas();
  }, []);

  const loadModels = async () => {
    try {
      const data = await api.listModels();
      setAvailableModels(data || []);
    } catch (error) {
      console.error('Failed to load models:', error);
      setAvailableModels([]);
    }
  };

  const loadPersonas = async () => {
    try {
      const data = await api.listPersonas();
      setPersonas(data || []);
    } catch (error) {
      console.error('Failed to load personas:', error);
      setPersonas([]);
    }
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let newNode;
      const id = `${type}-${Date.now()}`;

      switch (type) {
        case 'userInput':
          newNode = { id, type: 'userInput', position, data: { label: 'User Input', content: '' } };
          break;
        case 'modelNode':
          newNode = { id, type: 'modelNode', position, data: { label: 'Model', modelId: '', systemPrompt: '', persona: '' } };
          break;
        case 'instructionNode':
          newNode = { id, type: 'instructionNode', position, data: { label: 'Instruction', instructionType: 'system', content: '' } };
          break;
        case 'mergeNode':
          newNode = { id, type: 'mergeNode', position, data: { label: 'Merge', mergeStrategy: 'concat' } };
          break;
        case 'branchNode':
          newNode = { id, type: 'branchNode', position, data: { label: 'Branch', condition: '' } };
          break;
        case 'outputNode':
          newNode = { id, type: 'outputNode', position, data: { label: 'Output' } };
          break;
        default:
          return;
      }

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const updateNodeData = useCallback(
    (nodeId, newData) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        )
      );
      setSelectedNode((current) => (current?.id === nodeId ? { ...current, data: { ...current.data, ...newData } } : current));
    },
    [setNodes]
  );

  const validateWorkflow = () => {
    const errors = [];
    const userInputNodes = nodes.filter((n) => n.type === 'userInput');
    if (userInputNodes.length === 0) {
      errors.push('At least one User Input node is required');
    }
    const modelNodes = nodes.filter((n) => n.type === 'modelNode');
    for (const node of modelNodes) {
      if (!node.data.modelId) {
        errors.push(`Model node "${node.id}" does not have a model selected`);
      }
    }
    const cycleError = detectCycles(nodes, edges);
    if (cycleError) {
      errors.push(cycleError);
    }
    const branchNodes = nodes.filter((n) => n.type === 'branchNode');
    for (const node of branchNodes) {
      if (!node.data.condition || node.data.condition.trim() === '') {
        errors.push(`Branch node "${node.id}" does not have a condition`);
      }
    }
    return errors;
  };

  const detectCycles = (nodes, edges) => {
    const graph = {};
    const visited = {};
    const recStack = {};
    
    nodes.forEach((node) => {
      graph[node.id] = [];
      visited[node.id] = false;
      recStack[node.id] = false;
    });
    
    edges.forEach((edge) => {
      if (graph[edge.source]) {
        graph[edge.source].push(edge.target);
      }
    });
    
    const hasCycle = (nodeId) => {
      visited[nodeId] = true;
      recStack[nodeId] = true;
      
      for (const neighbor of graph[nodeId] || []) {
        if (!visited[neighbor]) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack[neighbor]) {
          return true;
        }
      }
      
      recStack[nodeId] = false;
      return false;
    };
    
    for (const nodeId in graph) {
      if (!visited[nodeId]) {
        if (hasCycle(nodeId)) {
          return 'Workflow contains a cycle. Please remove circular dependencies.';
        }
      }
    }
    
    return null;
  };

  const executeWorkflow = async () => {
    const validationErrors = validateWorkflow();
    if (validationErrors.length > 0) {
      alert('Validation errors:\n' + validationErrors.join('\n'));
      return;
    }

    setIsExecuting(true);
    setExecutionResults({});
    setNodeStates({});
    
    const initialStates = {};
    nodes.forEach((node) => {
      initialStates[node.id] = 'pending';
    });
    setNodeStates(initialStates);
    
    try {
      const executionOrder = topologicalSort(nodes, edges);
      const results = {};
      const branchDecisions = {};
      
      for (const nodeId of executionOrder) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        if (shouldSkipNode(nodeId, edges, branchDecisions, nodes)) {
          setNodeStates((prev) => ({ ...prev, [nodeId]: 'skipped' }));
          continue;
        }

        setNodeStates((prev) => ({ ...prev, [nodeId]: 'executing' }));

        try {
          const inputs = getNodeInputs(nodeId, edges, results, branchDecisions, nodes);
          const output = await executeNode(node, inputs, availableModels, personas, api);
          results[nodeId] = output;
          
          if (node.type === 'branchNode' && output.branch) {
            branchDecisions[nodeId] = output.branch;
          }
          
          setNodeStates((prev) => ({ ...prev, [nodeId]: 'completed' }));
        } catch (error) {
          console.error(`Error executing node ${nodeId}:`, error);
          results[nodeId] = { error: error.message, content: null };
          setNodeStates((prev) => ({ ...prev, [nodeId]: 'error' }));
        }
      }

      setExecutionResults(results);
      setShowResultsPanel(true);
    } catch (error) {
      console.error('Workflow execution error:', error);
      alert(`Execution failed: ${error.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const shouldSkipNode = (nodeId, edges, branchDecisions, nodes) => {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type === 'branchNode') {
        const decision = branchDecisions[edge.source];
        if (decision) {
          const expectedHandle = decision === 'true' ? 'true' : 'false';
          if (edge.sourceHandle !== expectedHandle) {
            return true;
          }
        }
      }
    }
    
    return false;
  };

  const saveWorkflow = () => {
    const name = prompt('Enter workflow name:');
    if (!name || name.trim() === '') return;
    
    const workflow = {
      name: name.trim(),
      nodes,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const workflows = JSON.parse(localStorage.getItem('workflows') || '[]');
    const existingIndex = workflows.findIndex((w) => w.name === name.trim());
    
    if (existingIndex >= 0) {
      if (!confirm(`Workflow "${name.trim()}" already exists. Overwrite?`)) {
        return;
      }
      workflows[existingIndex] = workflow;
    } else {
      workflows.push(workflow);
    }
    
    localStorage.setItem('workflows', JSON.stringify(workflows));
    alert('Workflow saved successfully!');
  };

  const loadWorkflow = () => {
    const workflows = JSON.parse(localStorage.getItem('workflows') || '[]');
    if (workflows.length === 0) {
      alert('No saved workflows found.');
      return;
    }
    
    const selectedName = prompt(`Select workflow to load:\n\n${workflows.map((w, i) => `${i + 1}. ${w.name}`).join('\n')}\n\nEnter number or name:`);
    
    if (!selectedName) return;
    
    let workflow = null;
    const index = parseInt(selectedName) - 1;
    if (index >= 0 && index < workflows.length) {
      workflow = workflows[index];
    } else {
      workflow = workflows.find((w) => w.name.toLowerCase() === selectedName.toLowerCase());
    }
    
    if (!workflow) {
      alert('Workflow not found.');
      return;
    }
    
    if (!confirm(`Load workflow "${workflow.name}"? This will replace the current workflow.`)) {
      return;
    }
    
    setNodes(workflow.nodes || []);
    setEdges(workflow.edges || []);
    setExecutionResults({});
    setNodeStates({});
    setShowResultsPanel(false);
    alert('Workflow loaded successfully!');
  };

  const deleteWorkflow = () => {
    const workflows = JSON.parse(localStorage.getItem('workflows') || '[]');
    if (workflows.length === 0) {
      alert('No saved workflows found.');
      return;
    }
    
    const selectedName = prompt(`Select workflow to delete:\n\n${workflows.map((w, i) => `${i + 1}. ${w.name}`).join('\n')}\n\nEnter number or name:`);
    
    if (!selectedName) return;
    
    let index = parseInt(selectedName) - 1;
    if (index < 0 || index >= workflows.length) {
      index = workflows.findIndex((w) => w.name.toLowerCase() === selectedName.toLowerCase());
    }
    
    if (index < 0) {
      alert('Workflow not found.');
      return;
    }
    
    if (confirm(`Delete workflow "${workflows[index].name}"?`)) {
      workflows.splice(index, 1);
      localStorage.setItem('workflows', JSON.stringify(workflows));
      alert('Workflow deleted successfully!');
    }
  };

  return (
    <div className="workflow-editor" style={{ height: '100vh', display: 'flex' }}>
      <NodeSelectorPanel theme={theme} />
      <div className="workflow-canvas" style={{ flex: 1 }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes.map((node) => ({
            ...node,
            data: {
              ...node.data,
              state: nodeStates[node.id],
              executionResult: executionResults[node.id],
              branchTaken: executionResults[node.id]?.branch,
            },
          }))}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className={theme === 'dark' ? 'dark' : ''}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
        <div className="workflow-toolbar">
          <button onClick={executeWorkflow} disabled={isExecuting}>
            {isExecuting ? 'Executing...' : 'Run Workflow'}
          </button>
          <button onClick={() => { setNodes([]); setEdges([]); setExecutionResults({}); setNodeStates({}); setShowResultsPanel(false); }}>Clear</button>
          <button onClick={saveWorkflow} disabled={isExecuting}>Save</button>
          <button onClick={loadWorkflow} disabled={isExecuting}>Load</button>
          <button onClick={deleteWorkflow} disabled={isExecuting}>Delete</button>
          {Object.keys(executionResults).length > 0 && (
            <button onClick={() => setShowResultsPanel(!showResultsPanel)}>
              {showResultsPanel ? 'Hide' : 'Show'} Results
            </button>
          )}
        </div>
      </div>
      {selectedNode && (
        <NodePropertiesPanel
          node={selectedNode}
          onUpdate={updateNodeData}
          onClose={() => setSelectedNode(null)}
          availableModels={availableModels}
          personas={personas}
          theme={theme}
          executionResult={executionResults[selectedNode.id]}
          nodeState={nodeStates[selectedNode.id]}
        />
      )}
      {showResultsPanel && Object.keys(executionResults).length > 0 && (
        <ResultsPanel
          results={executionResults}
          nodes={nodes}
          nodeStates={nodeStates}
          onClose={() => setShowResultsPanel(false)}
          theme={theme}
        />
      )}
    </div>
  );
}

function UserInputNode({ data, selected }) {
  const state = data?.state || '';
  return (
    <div className={`custom-node user-input ${selected ? 'selected' : ''} ${state}`}>
      <Handle type="source" position={Position.Right} />
      <div className="node-header">📝 User Input</div>
      <div className="node-content">{data.content || 'Click to edit...'}</div>
      {state === 'executing' && <div className="node-status">⏳ Executing...</div>}
      {state === 'completed' && <div className="node-status">✓ Completed</div>}
      {state === 'error' && <div className="node-status error">✗ Error</div>}
    </div>
  );
}

function ModelNode({ data, selected }) {
  const state = data?.state || '';
  return (
    <div className={`custom-node model ${selected ? 'selected' : ''} ${state}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="node-header">🤖 Model</div>
      <div className="node-content">{data.modelId || 'Select model...'}</div>
      {data.persona && <div className="node-meta">Persona: {data.persona}</div>}
      {state === 'executing' && <div className="node-status">⏳ Executing...</div>}
      {state === 'completed' && <div className="node-status">✓ Completed</div>}
      {state === 'error' && <div className="node-status error">✗ Error</div>}
    </div>
  );
}

function InstructionNode({ data, selected }) {
  const state = data?.state || '';
  return (
    <div className={`custom-node instruction ${selected ? 'selected' : ''} ${state}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="node-header">📋 {data.instructionType || 'Instruction'}</div>
      <div className="node-content">{data.content || 'Add instruction...'}</div>
      {state === 'executing' && <div className="node-status">⏳ Executing...</div>}
      {state === 'completed' && <div className="node-status">✓ Completed</div>}
      {state === 'error' && <div className="node-status error">✗ Error</div>}
    </div>
  );
}

function MergeNode({ data, selected }) {
  const state = data?.state || '';
  return (
    <div className={`custom-node merge ${selected ? 'selected' : ''} ${state}`}>
      <Handle type="target" position={Position.Left} id="input1" />
      <Handle type="target" position={Position.Top} id="input2" />
      <Handle type="target" position={Position.Bottom} id="input3" />
      <Handle type="source" position={Position.Right} />
      <div className="node-header">🔀 Merge</div>
      <div className="node-content">{data.mergeStrategy || 'concat'}</div>
      {state === 'executing' && <div className="node-status">⏳ Executing...</div>}
      {state === 'completed' && <div className="node-status">✓ Completed</div>}
      {state === 'error' && <div className="node-status error">✗ Error</div>}
    </div>
  );
}

function BranchNode({ data, selected }) {
  const state = data?.state || '';
  const branchTaken = data?.branchTaken;
  return (
    <div className={`custom-node branch ${selected ? 'selected' : ''} ${state}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Top} id="true" />
      <Handle type="source" position={Position.Bottom} id="false" />
      <div className="node-header">🌳 Branch</div>
      <div className="node-content">{data.condition || 'Condition...'}</div>
      {branchTaken && <div className="node-meta">Branch taken: {branchTaken}</div>}
      {state === 'executing' && <div className="node-status">⏳ Executing...</div>}
      {state === 'completed' && <div className="node-status">✓ Completed</div>}
      {state === 'error' && <div className="node-status error">✗ Error</div>}
    </div>
  );
}

function OutputNode({ data, selected }) {
  const state = data?.state || '';
  const result = data?.executionResult;
  return (
    <div className={`custom-node output ${selected ? 'selected' : ''} ${state}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-header">📤 Output</div>
      {result && (
        <div className="node-result">
          {result.error ? (
            <div className="node-error">Error: {result.error}</div>
          ) : (
            <div className="node-result-content">
              {typeof result.content === 'string' ? (
                result.content.length > 100 ? (
                  <>
                    {result.content.substring(0, 100)}...
                    <div className="node-result-expand">(Click to view full result)</div>
                  </>
                ) : (
                  result.content
                )
              ) : (
                JSON.stringify(result.content)
              )}
            </div>
          )}
        </div>
      )}
      {state === 'executing' && <div className="node-status">⏳ Executing...</div>}
      {state === 'completed' && <div className="node-status">✓ Completed</div>}
      {state === 'error' && <div className="node-status error">✗ Error</div>}
    </div>
  );
}

function NodeSelectorPanel({ theme }) {
  const nodeTypes = [
    { type: 'userInput', label: '📝 User Input', description: 'User query input' },
    { type: 'modelNode', label: '🤖 Model', description: 'LLM model node' },
    { type: 'instructionNode', label: '📋 Instruction', description: 'System/developer instruction' },
    { type: 'mergeNode', label: '🔀 Merge', description: 'Merge multiple inputs' },
    { type: 'branchNode', label: '🌳 Branch', description: 'Conditional branching' },
    { type: 'outputNode', label: '📤 Output', description: 'Final output' },
  ];

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={`node-selector-panel ${theme === 'dark' ? 'dark' : ''}`}>
      <h3>Node Types</h3>
      <div className="node-list">
        {nodeTypes.map((node) => (
          <div
            key={node.type}
            className="draggable-node"
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
          >
            <div className="node-icon">{node.label.split(' ')[0]}</div>
            <div className="node-info">
              <div className="node-label">{node.label.substring(2)}</div>
              <div className="node-description">{node.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodePropertiesPanel({ node, onUpdate, onClose, availableModels, personas, theme, executionResult, nodeState }) {
  const renderProperties = () => {
    switch (node.type) {
      case 'userInput':
        return (
          <div>
            <label>Content:</label>
            <textarea
              value={node.data.content || ''}
              onChange={(e) => onUpdate(node.id, { content: e.target.value })}
              placeholder="Enter user input..."
              rows={5}
            />
            {executionResult && (
              <div className="execution-result">
                <strong>Result:</strong>
                <pre>{JSON.stringify(executionResult, null, 2)}</pre>
              </div>
            )}
          </div>
        );
      case 'modelNode':
        return (
          <>
            <div>
              <label>Model:</label>
              <select
                value={node.data.modelId || ''}
                onChange={(e) => onUpdate(node.id, { modelId: e.target.value })}
              >
                <option value="">Select model...</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Persona:</label>
              <select
                value={node.data.persona || ''}
                onChange={(e) => onUpdate(node.id, { persona: e.target.value })}
              >
                <option value="">None</option>
                {personas.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Custom System Prompt:</label>
              <textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => onUpdate(node.id, { systemPrompt: e.target.value })}
                placeholder="Optional custom system prompt..."
                rows={3}
              />
            </div>
            {executionResult && (
              <div className="execution-result">
                <strong>Result:</strong>
                {executionResult.error ? (
                  <div className="error-message">Error: {executionResult.error}</div>
                ) : (
                  <pre>{executionResult.content || 'No content'}</pre>
                )}
              </div>
            )}
          </>
        );
      case 'instructionNode':
        return (
          <>
            <div>
              <label>Instruction Type:</label>
              <select
                value={node.data.instructionType || 'system'}
                onChange={(e) => onUpdate(node.id, { instructionType: e.target.value })}
              >
                <option value="system">System</option>
                <option value="developer">Developer</option>
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
              </select>
            </div>
            <div>
              <label>Content:</label>
              <textarea
                value={node.data.content || ''}
                onChange={(e) => onUpdate(node.id, { content: e.target.value })}
                placeholder="Enter instruction..."
                rows={5}
              />
            </div>
            {executionResult && (
              <div className="execution-result">
                <strong>Result:</strong>
                <pre>{JSON.stringify(executionResult, null, 2)}</pre>
              </div>
            )}
          </>
        );
      case 'mergeNode':
        return (
          <>
            <div>
              <label>Merge Strategy:</label>
              <select
                value={node.data.mergeStrategy || 'concat'}
                onChange={(e) => onUpdate(node.id, { mergeStrategy: e.target.value })}
              >
                <option value="concat">Concatenate</option>
                <option value="join">Join with separator</option>
                <option value="average">Average (numeric)</option>
              </select>
            </div>
            {executionResult && (
              <div className="execution-result">
                <strong>Result:</strong>
                <pre>{JSON.stringify(executionResult, null, 2)}</pre>
              </div>
            )}
          </>
        );
      case 'branchNode':
        return (
          <>
            <div>
              <label>Condition:</label>
              <textarea
                value={node.data.condition || ''}
                onChange={(e) => onUpdate(node.id, { condition: e.target.value })}
                placeholder="JavaScript condition (e.g., input.content.length > 100)"
                rows={3}
              />
            </div>
            {executionResult && (
              <div className="execution-result">
                <strong>Result:</strong>
                <div>Branch taken: {executionResult.branch || 'unknown'}</div>
                <div>Condition result: {String(executionResult.condition)}</div>
              </div>
            )}
          </>
        );
      case 'outputNode':
        return (
          <>
            {executionResult && (
              <div className="execution-result">
                <strong>Final Output:</strong>
                {executionResult.error ? (
                  <div className="error-message">Error: {executionResult.error}</div>
                ) : (
                  <pre>{executionResult.content || 'No content'}</pre>
                )}
              </div>
            )}
            {!executionResult && <div>No output yet. Run the workflow to see results.</div>}
          </>
        );
      default:
        return <div>No properties</div>;
    }
  };

  return (
    <div className={`node-properties-panel ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="panel-header">
        <h3>Properties: {node.data.label}</h3>
        <button onClick={onClose}>×</button>
      </div>
      {nodeState && (
        <div className={`node-state-indicator ${nodeState}`}>
          Status: {nodeState}
        </div>
      )}
      <div className="panel-content">{renderProperties()}</div>
    </div>
  );
}

function ResultsPanel({ results, nodes, nodeStates, onClose, theme }) {
  return (
    <div className={`results-panel ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="results-header">
        <h3>Execution Results</h3>
        <button onClick={onClose}>×</button>
      </div>
      <div className="results-content">
        {nodes.map((node) => {
          const result = results[node.id];
          const state = nodeStates[node.id];
          if (!result && state !== 'skipped') return null;
          
          return (
            <div key={node.id} className={`result-item ${state || ''}`}>
              <div className="result-header">
                <strong>{node.data.label || node.id}</strong>
                <span className={`result-status ${state || ''}`}>{state || 'pending'}</span>
              </div>
              {result && (
                <div className="result-body">
                  {result.error ? (
                    <div className="error-message">Error: {result.error}</div>
                  ) : (
                    <pre>{typeof result.content === 'string' ? result.content : JSON.stringify(result, null, 2)}</pre>
                  )}
                </div>
              )}
              {state === 'skipped' && <div className="skipped-message">Skipped (inactive branch)</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function topologicalSort(nodes, edges) {
  const inDegree = {};
  const graph = {};
  
  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    graph[node.id] = [];
  });

  edges.forEach((edge) => {
    if (graph[edge.source] && inDegree[edge.target] !== undefined) {
      graph[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  });

  const userInputNodes = nodes.filter((n) => n.type === 'userInput').map((n) => n.id);
  const queue = [...userInputNodes];
  const otherNodes = nodes.filter((n) => n.type !== 'userInput' && inDegree[n.id] === 0).map((n) => n.id);
  queue.push(...otherNodes);
  
  const result = [];
  const processed = new Set();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (processed.has(nodeId)) continue;
    
    result.push(nodeId);
    processed.add(nodeId);
    
    (graph[nodeId] || []).forEach((neighborId) => {
      inDegree[neighborId]--;
      if (inDegree[neighborId] === 0 && !processed.has(neighborId)) {
        queue.push(neighborId);
      }
    });
  }

  nodes.forEach((node) => {
    if (!processed.has(node.id)) {
      result.push(node.id);
    }
  });

  return result;
}

function getNodeInputs(nodeId, edges, results, branchDecisions, nodes) {
  const inputEdges = edges.filter((e) => e.target === nodeId);
  const inputs = [];
  
  for (const edge of inputEdges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (sourceNode?.type === 'branchNode') {
      const decision = branchDecisions[edge.source];
      if (decision) {
        const expectedHandle = decision === 'true' ? 'true' : 'false';
        if (edge.sourceHandle !== expectedHandle) {
          continue;
        }
      }
    }
    
    const result = results[edge.source];
    if (result) {
      if (edge.targetHandle) {
        inputs.push({ ...result, _handleId: edge.targetHandle });
      } else {
        inputs.push(result);
      }
    }
  }
  
  return inputs;
}

async function executeNode(node, inputs, availableModels, personas, api) {
  try {
    switch (node.type) {
      case 'userInput':
        if (!node.data.content) {
          throw new Error('User input content is required');
        }
        return { content: node.data.content };
      
      case 'modelNode':
        if (!node.data.modelId) {
          throw new Error('Model not selected');
        }
        
        const persona = personas.find((p) => p.name === node.data.persona);
        const systemPrompt = persona?.system_prompt || node.data.systemPrompt || '';
        
        let userContent = '';
        if (inputs.length > 0) {
          userContent = inputs.map((i) => {
            if (typeof i === 'string') return i;
            return i.content || JSON.stringify(i);
          }).join('\n\n');
        }
        
        if (!userContent && !systemPrompt) {
          throw new Error('No input content or system prompt provided');
        }
        
        const messages = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        if (userContent) {
          messages.push({ role: 'user', content: userContent });
        }
        
        if (messages.length === 0) {
          throw new Error('No messages to send to model');
        }
        
        const response = await api.queryModel(node.data.modelId, messages);
        
        if (!response || !response.content) {
          throw new Error('Model returned empty response');
        }
        
        return { content: response.content, reasoning_details: response.reasoning_details };
      
      case 'instructionNode':
        if (!node.data.content) {
          throw new Error('Instruction content is required');
        }
        
        const baseInput = inputs[0] || {};
        const instructionType = node.data.instructionType || 'system';
        
        return {
          ...baseInput,
          [instructionType]: node.data.content,
          content: baseInput.content || node.data.content,
        };
      
      case 'mergeNode':
        if (inputs.length === 0) {
          throw new Error('Merge node requires at least one input');
        }
        
        const contents = [];
        inputs.forEach((input) => {
          if (typeof input === 'string') {
            contents.push(input);
          } else if (input.content) {
            contents.push(input.content);
          } else {
            contents.push(JSON.stringify(input));
          }
        });
        
        if (contents.length === 0) {
          return { content: '' };
        }
        
        const strategy = node.data.mergeStrategy || 'concat';
        if (strategy === 'concat') {
          return { content: contents.join('\n\n') };
        } else if (strategy === 'join') {
          return { content: contents.join(' ') };
        } else if (strategy === 'average') {
          const numbers = contents.map((c) => parseFloat(c)).filter((n) => !isNaN(n));
          if (numbers.length > 0) {
            const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            return { content: String(avg) };
          }
          return { content: contents.join('\n\n') };
        }
        return { content: contents.join('\n\n') };
      
      case 'branchNode':
        if (!node.data.condition || node.data.condition.trim() === '') {
          throw new Error('Branch condition is required');
        }
        
        const input = inputs[0] || {};
        
        let conditionResult = false;
        try {
          const conditionCode = node.data.condition.trim();
          if (conditionCode.includes('function') || conditionCode.includes('eval') || conditionCode.includes('import')) {
            throw new Error('Invalid condition: cannot use functions, eval, or imports');
          }
          
          const safeEval = new Function('input', `
            try {
              return Boolean(${conditionCode});
            } catch (e) {
              return false;
            }
          `);
          
          conditionResult = safeEval(input);
        } catch (error) {
          throw new Error(`Failed to evaluate condition: ${error.message}`);
        }
        
        return {
          condition: conditionResult,
          branch: conditionResult ? 'true' : 'false',
        };
      
      case 'outputNode':
        return inputs[0] || { content: 'No input received' };
      
      default:
        return inputs[0] || {};
    }
  } catch (error) {
    throw new Error(`Node ${node.id} (${node.type}): ${error.message}`);
  }
}


