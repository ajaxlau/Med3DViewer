using Workerd = import "/workerd/workerd.capnp";

# No sockets, network destinations, real model URLs or credentials. Real fetch
# serializes/validates Request options before routing to this in-process origin.
const config :Workerd.Config = (
  services = [
    (name = "internet", network = (allow = [])),
    (name = "share-download", worker = (
      modules = [(name = "test.mjs", esModule = embed "../../.share-config/runtime-share-download.mjs")],
      globalOutbound = "mock-dropbox",
    )),
    (name = "dropbox-oauth", worker = (
      modules = [(name = "test.mjs", esModule = embed "../../.share-config/runtime-dropbox-oauth.mjs")],
      globalOutbound = "mock-dropbox-oauth",
    )),
    (name = "mock-dropbox-oauth", worker = (
      modules = [(name = "origin.mjs", esModule = embed "mockDropboxOAuth.mjs")],
    )),
    (name = "mock-dropbox", worker = (
      modules = [(name = "origin.mjs", esModule = embed "mockDropbox.mjs")],
    )),
  ],
);
