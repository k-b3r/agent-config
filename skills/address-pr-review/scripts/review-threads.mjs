#!/usr/bin/env node
// Review findings on a PR, and closing them out, via the GitHub GraphQL API
// (REST can't see whether a thread is resolved, or resolve one).
//
// usage: review-threads.mjs list <pr-number> [--repo owner/name]
//          JSON: branch, labels, unresolved threads (with thread ids), latest review summary
//        review-threads.mjs close <thread-id> <reply> [--keep-open]
//          reply on the thread, then resolve it unless --keep-open
// Needs an authenticated `gh`.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// The agent review in k-b3r/agent-config posts as this login.
const DEFAULT_REVIEWER = 'claude'
const MAX_THREADS = 100
const MAX_COMMENTS = 50

const PR_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      headRefName
      labels(first: 20) { nodes { name } }
      reviewThreads(first: ${MAX_THREADS}) {
        nodes {
          id isResolved isOutdated path line
          comments(first: ${MAX_COMMENTS}) { nodes { author { login } body url } }
        }
      }
      comments(last: ${MAX_COMMENTS}) { nodes { author { login } body url } }
    }
  }
}`

const REPLY_MUTATION = `mutation($thread: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) { comment { url } }
}`

const RESOLVE_MUTATION = `mutation($thread: ID!) {
  resolveReviewThread(input: { threadId: $thread }) { thread { isResolved } }
}`

const login = (c) => c.author?.login ?? 'ghost'

export function summarizeReview(pr) {
  const open = pr.reviewThreads.nodes.filter((t) => !t.isResolved)
  const threads = open.map((t) => {
    const [first, ...rest] = t.comments.nodes
    return {
      id: t.id,
      path: t.path,
      line: t.line,
      outdated: t.isOutdated,
      author: login(first),
      body: first.body,
      url: first.url,
      replies: rest.map((c) => ({ author: login(c), body: c.body })),
    }
  })
  const reviewers = new Set([DEFAULT_REVIEWER, ...threads.map((t) => t.author)])
  const summary = pr.comments.nodes.filter((c) => reviewers.has(login(c))).at(-1)
  return {
    branch: pr.headRefName,
    labels: pr.labels.nodes.map((l) => l.name),
    summary: summary ? { author: login(summary), body: summary.body, url: summary.url } : null,
    threads,
  }
}

function graphql(query, vars) {
  const args = ['api', 'graphql', '-f', `query=${query}`]
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`)
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' })).data
}

function currentRepo() {
  return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    encoding: 'utf8',
  }).trim()
}

function main(argv) {
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? undefined : argv.splice(i, 2)[1]
  }
  const keepOpen = argv.includes('--keep-open')
  if (keepOpen) argv.splice(argv.indexOf('--keep-open'), 1)
  const repo = flag('--repo')
  const [command, ...rest] = argv

  if (command === 'list' && rest[0]) {
    const [owner, name] = (repo ?? currentRepo()).split('/')
    const data = graphql(PR_QUERY, { owner, name, number: Number(rest[0]) })
    console.log(JSON.stringify(summarizeReview(data.repository.pullRequest), null, 2))
    return 0
  }
  if (command === 'close' && rest[0] && rest[1]) {
    const reply = graphql(REPLY_MUTATION, { thread: rest[0], body: rest[1] })
    if (!keepOpen) graphql(RESOLVE_MUTATION, { thread: rest[0] })
    console.log(reply.addPullRequestReviewThreadReply.comment.url)
    return 0
  }
  console.error('usage: review-threads.mjs list <pr> [--repo o/n] | close <thread-id> <reply> [--keep-open]')
  return 2
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
