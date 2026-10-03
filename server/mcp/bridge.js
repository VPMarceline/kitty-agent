let modulePromise;

function loadClient() {
  if (!modulePromise) modulePromise = import("./client.mjs");
  return modulePromise;
}

async function listShoppingTools() {
  return (await loadClient()).listShoppingTools();
}

async function callShoppingTool(name, args) {
  return (await loadClient()).callShoppingTool(name, args);
}

async function closeShoppingMcp() {
  if (!modulePromise) return;
  return (await modulePromise).closeShoppingMcp();
}

module.exports = { callShoppingTool, closeShoppingMcp, listShoppingTools };
