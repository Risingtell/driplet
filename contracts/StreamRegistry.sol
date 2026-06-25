// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * StreamRegistry: on-chain metadata for Driplet streams on Arc.
 *
 * Files (video blobs) live on Walrus (decentralized storage); the pointer to
 * each blob and the stream's metadata live here, on Arc. So storage is
 * decentralized end to end: metadata on Arc, blobs on Walrus, exactly as the
 * Lepton/Canteen organizer recommended.
 */
contract StreamRegistry {
    struct Entry {
        string blobId; // Walrus blob id (empty for a live camera stream)
        string creator;
        string title;
        address registeredBy;
        uint256 registeredAt;
    }

    mapping(bytes32 => Entry) private entries;

    event StreamRegistered(
        string slug,
        string blobId,
        string creator,
        string title,
        address indexed registeredBy,
        uint256 registeredAt
    );

    /// Record (or update) a stream's metadata on-chain.
    function register(
        string calldata slug,
        string calldata blobId,
        string calldata creator,
        string calldata title
    ) external {
        entries[keccak256(bytes(slug))] = Entry(blobId, creator, title, msg.sender, block.timestamp);
        emit StreamRegistered(slug, blobId, creator, title, msg.sender, block.timestamp);
    }

    /// Read a stream's on-chain metadata by slug.
    function get(string calldata slug) external view returns (Entry memory) {
        return entries[keccak256(bytes(slug))];
    }
}
