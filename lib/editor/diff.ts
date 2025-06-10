// Modified from https://github.com/hamflx/prosemirror-diff/blob/master/src/diff.js

import { diff_match_patch } from 'diff-match-patch';
import { Fragment, type Node, type Schema } from 'prosemirror-model';

export const DiffType = {
  Unchanged: 0,
  Deleted: -1,
  Inserted: 1,
} as const;

type DiffTypeValue = (typeof DiffType)[keyof typeof DiffType];

interface DiffNode {
  type: DiffTypeValue;
  node: Node;
}

type NodeOrFragment = Node | Fragment | DiffNode[];

export const patchDocumentNode = (
  schema: Schema,
  oldNode: Node,
  newNode: Node,
): DiffNode[] => {
  assertNodeTypeEqual(oldNode, newNode);

  const finalLeftChildren: DiffNode[] = [];
  const finalRightChildren: DiffNode[] = [];

  const oldChildren = normalizeNodeContent(oldNode);
  const newChildren = normalizeNodeContent(newNode);
  const oldChildLen = oldChildren.length;
  const newChildLen = newChildren.length;
  const minChildLen = Math.min(oldChildLen, newChildLen);

  let left = 0;
  let right = 0;

  for (; left < minChildLen; left++) {
    const oldChild = oldChildren[left];
    const newChild = newChildren[left];
    if (!isNodeEqual(oldChild, newChild)) {
      break;
    }
    finalLeftChildren.push(...ensureArray(oldChild));
  }

  for (; right + left + 1 < minChildLen; right++) {
    const oldChild = oldChildren[oldChildLen - right - 1];
    const newChild = newChildren[newChildLen - right - 1];
    if (!isNodeEqual(oldChild, newChild)) {
      break;
    }
    finalRightChildren.unshift(...ensureArray(oldChild));
  }

  const diffOldChildren = oldChildren.slice(left, oldChildLen - right);
  const diffNewChildren = newChildren.slice(left, newChildLen - right);

  if (diffOldChildren.length && diffNewChildren.length) {
    const matchedNodes = matchNodes(schema, diffOldChildren, diffNewChildren);
    finalLeftChildren.push(...matchedNodes);
  } else if (diffOldChildren.length) {
    finalLeftChildren.push(
      ...diffOldChildren.map((child) => ({
        type: DiffType.Deleted,
        node: child,
      })),
    );
  } else if (diffNewChildren.length) {
    finalLeftChildren.push(
      ...diffNewChildren.map((child) => ({
        type: DiffType.Inserted,
        node: child,
      })),
    );
  }

  return [...finalLeftChildren, ...finalRightChildren];
};

const normalizeNodeContent = (node: Node): Node[] => {
  const children: Node[] = [];
  if (node.content) {
    node.content.forEach((child) => {
      children.push(child);
    });
  }
  return children;
};

const isNodeEqual = (oldNode: Node, newNode: Node): boolean => {
  return oldNode.eq(newNode);
};

const ensureArray = (node: Node): DiffNode[] => {
  return [{ type: DiffType.Unchanged, node }];
};

const assertNodeTypeEqual = (oldNode: Node, newNode: Node): void => {
  if (oldNode.type !== newNode.type) {
    throw new Error('Node types must be equal');
  }
};

const matchNodes = (
  schema: Schema,
  oldChildren: Node[],
  newChildren: Node[],
): DiffNode[] => {
  const results: DiffNode[] = [];

  // Simple diff implementation for now
  // This could be enhanced with a more sophisticated matching algorithm
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldChildren.length && newIndex < newChildren.length) {
    const oldChild = oldChildren[oldIndex];
    const newChild = newChildren[newIndex];

    if (isNodeEqual(oldChild, newChild)) {
      results.push({ type: DiffType.Unchanged, node: oldChild });
      oldIndex++;
      newIndex++;
    } else if (
      oldChild.type === newChild.type &&
      oldChild.isText &&
      newChild.isText
    ) {
      // Handle text node differences
      const textDiffs = diffText(oldChild.text || '', newChild.text || '');
      results.push(
        ...textDiffs.map((diff) => ({
          type: diff.type,
          node: schema.text(diff.text, oldChild.marks),
        })),
      );
      oldIndex++;
      newIndex++;
    } else {
      // Different nodes - mark old as deleted and new as inserted
      results.push({ type: DiffType.Deleted, node: oldChild });
      results.push({ type: DiffType.Inserted, node: newChild });
      oldIndex++;
      newIndex++;
    }
  }

  // Handle remaining nodes
  while (oldIndex < oldChildren.length) {
    results.push({ type: DiffType.Deleted, node: oldChildren[oldIndex] });
    oldIndex++;
  }

  while (newIndex < newChildren.length) {
    results.push({ type: DiffType.Inserted, node: newChildren[newIndex] });
    newIndex++;
  }

  return results;
};

interface TextDiff {
  type: DiffTypeValue;
  text: string;
}

const diffText = (oldText: string, newText: string): TextDiff[] => {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([operation, text]) => ({
    type: operation as DiffTypeValue,
    text,
  }));
};

export const diffNodes = (
  schema: Schema,
  oldNode: Node,
  newNode: Node,
): DiffNode[] => {
  return patchDocumentNode(schema, oldNode, newNode);
};

export const applyDiff = (schema: Schema, diffs: DiffNode[]): Node => {
  const content: Node[] = [];

  for (const diff of diffs) {
    if (diff.type !== DiffType.Deleted) {
      content.push(diff.node);
    }
  }

  return schema.nodes.doc.create({}, Fragment.from(content));
};

export const renderDiffAsHTML = (diffs: DiffNode[]): string => {
  return diffs
    .map((diff) => {
      const className =
        diff.type === DiffType.Inserted
          ? 'diff-inserted'
          : diff.type === DiffType.Deleted
            ? 'diff-deleted'
            : 'diff-unchanged';

      return `<span class="${className}">${escapeHtml(diff.node.textContent || '')}</span>`;
    })
    .join('');
};

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export type { DiffNode, NodeOrFragment, DiffTypeValue };
