// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {EFHEvents, EFVoting} from "@fhevm/lib.sol";
import "@fhevm/lib/TFHE.sol";

contract ConfidentialVoting is EFHEvents, EFVoting {
    uint256 public electionCounter;

    struct Election {
        uint256 id;
        string title;
        string[] options;
        uint256 optionCount;
        bool isActive;
        uint256 voterCount;
    }

    mapping(uint256 => Election) public elections;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(uint256 => euint32)) public encryptedTallies;

    event ElectionCreated(uint256 indexed electionId, string title, uint256 optionCount);
    event VoteCast(uint256 indexed electionId, address indexed voter);
    event ElectionClosed(uint256 indexed electionId);

    function createElection(string calldata title, string[] calldata options)
        external
        returns (uint256)
    {
        require(bytes(title).length > 0, "Title required");
        require(options.length >= 2, "At least 2 options required");

        uint256 electionId = ++electionCounter;

        elections[electionId] = Election({
            id: electionId,
            title: title,
            options: options,
            optionCount: options.length,
            isActive: true,
            voterCount: 0
        });

        for (uint256 i = 0; i < options.length; i++) {
            encryptedTallies[electionId][i] = TFHE.asEuint32(0);
        }

        emit ElectionCreated(electionId, title, options.length);
        return electionId;
    }

    function castVote(uint256 electionId, einput encryptedOption, bytes calldata inputProof) external {
        Election storage election = elections[electionId];
        require(election.id != 0, "Election does not exist");
        require(election.isActive, "Election is not active");
        require(!hasVoted[electionId][msg.sender], "Already voted");

        euint32 voteValue = TFHE.asEuint32(encryptedOption, inputProof);

        for (uint256 i = 0; i < election.optionCount; i++) {
            euint32 isThisOption = TFHE.asEuint32(TFHE.eq(voteValue, TFHE.asEuint32(i)));
            euint32 increment = TFHE.mul(isThisOption, TFHE.asEuint32(1));
            encryptedTallies[electionId][i] = TFHE.add(encryptedTallies[electionId][i], increment);
        }

        hasVoted[electionId][msg.sender] = true;
        election.voterCount++;

        emit VoteCast(electionId, msg.sender);
    }

    function closeElection(uint256 electionId) external {
        Election storage election = elections[electionId];
        require(election.id != 0, "Election does not exist");
        require(election.isActive, "Election already closed");

        election.isActive = false;
        emit ElectionClosed(electionId);
    }

    function getElection(uint256 electionId)
        external
        view
        returns (string memory title, string[] memory options, bool isActive, uint256 voterCount)
    {
        Election storage election = elections[electionId];
        require(election.id != 0, "Election does not exist");
        return (election.title, election.options, election.isActive, election.voterCount);
    }

    function getEncryptedTally(uint256 electionId, uint256 optionIndex)
        external
        view
        returns (euint32)
    {
        require(elections[electionId].id != 0, "Election does not exist");
        require(optionIndex < elections[electionId].optionCount, "Invalid option index");
        return encryptedTallies[electionId][optionIndex];
    }
}