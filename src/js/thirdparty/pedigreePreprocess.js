export function makeMultiDTreeData(samples, uuid) {
  const components = findConnectedComponents(samples);
  const dtreeData = [];

  components.forEach((component) => {
    const singleDTreeData = makeDTreeData(component, uuid);
    dtreeData.push(singleDTreeData[0]);
  });

  return dtreeData;
}

function makeDTreeData(samples, uuid) {
  const root = findTreeRoot(samples);

  const rootObject = makeDTreeObject(root, uuid);

  const dtreeData = [rootObject];

  // invariant:
  //   everything in frontier is a dtreeObject.
  //   nothing in frontier that exits re-enters.
  let frontier = [rootObject];

  while (frontier.length > 0) {
    const node = frontier.shift();

    const spouse = findSpouse(node, samples);
    const children = findChildren(node, samples);

    if (spouse) {
      const spouseObject = makeDTreeObject(spouse, uuid);

      node.marriages = [{
        spouse: spouseObject,
      }];
    }

    if (children.length > 0) {
      const childObjects = [];
      children.forEach((child) => {
        childObjects.push(makeDTreeObject(child, uuid));
      });

      if (node.marriages) {
        node.marriages[0].children = childObjects;
      } else {
        node.marriages = [{
          children: childObjects,
        }];
      }

      frontier = frontier.concat(childObjects);
    }
  }

  return dtreeData;
}

function makeDTreeObject(node, uuid) {
  const dtreeObject = {
    name: node.id, /* not used */
    extra: {
      uuid: node.uuid,
      sex: getSex(node),
      affected: isAffected(node),
      isMainSample: node.uuid === uuid,
      isChild: node.pedigree.maternal_id !== null || node.pedigree.paternal_id !== null,
    },
  };

  return dtreeObject;
}

function findSpouse(node, samples) {
  // assumes a sample has only one spouse.
  // it would be possible to relax this requirement
  // with more bookkeeping.

  let spouseUuid = null;

  const nodeUuid = node.extra.uuid;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const motherId = sample.pedigree.maternal_id;
    const fatherId = sample.pedigree.paternal_id;

    if (nodeUuid === motherId) {
      spouseUuid = fatherId;
      break;
    } else if (nodeUuid === fatherId) {
      spouseUuid = motherId;
      break;
    }
  }

  if (spouseUuid) {
    return samples.find(sample => sample.uuid === spouseUuid);
  }
  return null;
}

function findChildren(node, samples) {
  const children = [];

  const nodeUuid = node.extra.uuid;

  samples.forEach((sample) => {
    const motherId = sample.pedigree.maternal_id;
    const fatherId = sample.pedigree.paternal_id;
    if (nodeUuid === motherId || nodeUuid === fatherId) {
      children.push(sample);
    }
  });

  return children;
}

function addToNeighbors(nodes, key, list) {
  if (nodes[key]) {
    nodes[key] = nodes[key].concat(list);
  } else {
    nodes[key] = list;
  }
}

function moralizeGraph(samples) {
  const nodes = {}; // indexed by UUID, list of uuids it sees

  samples.forEach((sample) => {
    const mother = sample.pedigree.maternal_id;
    const father = sample.pedigree.paternal_id;

    const neighbors = [];

    if (mother) {
      addToNeighbors(nodes, mother, [sample.uuid]);
      neighbors.push(mother);
    }

    if (father) {
      addToNeighbors(nodes, father, [sample.uuid]);
      neighbors.push(father);
    }

    addToNeighbors(nodes, sample.uuid, neighbors);
  });

  return nodes;
}

function findConnectedComponents(samples) {
  const components = [];

  const graph = moralizeGraph(samples);

  const visited = {};
  const nNodes = samples.length;

  while (Object.keys(visited).length < nNodes) {
    // find next unvisited
    let start = null;
    Object.keys(graph).forEach((key) => {
      if (!visited[key]) {
        start = +key;
      }
    });

    // depth-first search to grab that node's component
    const frontier = [start];
    visited[start] = true;
    const component = [];

    while (frontier.length > 0) {
      const node = frontier.pop();
      component.push(node);

      const neighbors = graph[node];
      neighbors.forEach((neighbor) => {
        if (!visited[neighbor]) {
          frontier.push(neighbor);
          visited[neighbor] = true;
        }
      });
    }

    // add the component to the component list
    components.push(component);
  }

  const componentsAsSamples = [];

  const uuidToSample = {};
  samples.forEach((sample) => {
    uuidToSample[sample.uuid] = sample;
  });

  components.forEach((component) => {
    const selectedSamples = [];
    component.forEach((uuid) => {
      selectedSamples.push(uuidToSample[uuid]);
    });
    componentsAsSamples.push(selectedSamples);
  });

  return componentsAsSamples;
}

function findTreeRoot(samples) {
  // stores (rootNode, Node, depth) tuples
  const frontier = [];

  samples.forEach((sample) => {
    if (hasNoParents(sample)) {
      // could be someone's spouse, or the "true" root
      frontier.push([sample, sample, 0]);
    }
  });

  let maxDepth = -1;
  let maxRoot = null;

  while (frontier.length > 0) {
    const [root, node, depth] = frontier.shift();

    if (depth > maxDepth) {
      maxRoot = root;
      maxDepth = depth;
    }

    samples.forEach((possibleChild) => {
      if (node.uuid === possibleChild.pedigree.paternal_id) {
        const child = possibleChild;
        frontier.push([root, child, depth + 1]);
      }
    });
  }

  return maxRoot;
}

function getSex(sample) {
  return sample.pedigree.sex === 1 ? 'm' : 'f';
}

function isAffected(sample) {
  return sample.pedigree.affection_status === 2;
}

function hasNoParents(sample) {
  const mother = sample.pedigree.maternal_id;
  const father = sample.pedigree.paternal_id;
  return !mother && !father;
}
