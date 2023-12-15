
// the index should load the config, setup the API endpoints and connect to rabbitMQ. 

// Unfortunately, it is impossible to drop all edges between graph nodes in dgraph

// 1. Get all matching terms and object links and sdgs.

// For each term we have to do this
// 2. drop all objects from matching terms, build object sdgs and terms 

// For all info objects
// 3. drop all sdgs and matching terms from infoobjects

// After a term is fully cleared, it can get reindexed via a message to the indexer.

