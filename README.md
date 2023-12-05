# clearindex
Microservice to reset the indexing process

This service is similar to the keyword webhook, but is not linked to changes of the indexing files.

## Requirements

- Delete all detected matches, but not the index terms
- Trigger indexing process. 
- Provide a frontend endpoint for selected users. 

## Configuration 

The system includes a very basic configuration to the database and the messaage queue.
