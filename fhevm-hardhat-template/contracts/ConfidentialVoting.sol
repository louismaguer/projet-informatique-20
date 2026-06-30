// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, ebool, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Confidential Voting - Vote Scrutin Confidentiel avec FHE
/// @notice Système de vote où les bulletins sont chiffrés, mais le total est calculé on-chain
contract ConfidentialVoting is ZamaEthereumConfig {
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

    /// @notice Crée une nouvelle election
    /// @param title Titre de l'election
    /// @param options Liste des options (candidats)
    /// @return id de l'election creee
    function createElection(string calldata title, string[] calldata options)
        external
        returns (uint256)
    {
        require(bytes(title).length > 0, "CreateElection: title cannot be empty");
        require(options.length >= 2, "CreateElection: at least 2 options required");
        require(options.length <= 100, "CreateElection: max 100 options allowed");
        for (uint256 i = 0; i < options.length; i++) {
            require(bytes(options[i]).length > 0, "CreateElection: empty option not allowed");
        }

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
            euint32 zero = FHE.asEuint32(uint32(0));
            FHE.allowThis(zero);
            encryptedTallies[electionId][i] = zero;
        }

        emit ElectionCreated(electionId, title, options.length);
        return electionId;
    }

    /// @notice Vote pour une election avec un vote chiffré
    /// @param electionId ID de l'election
    /// @param encryptedOption Choix chiffré (0 à optionCount-1)
    /// @param inputProof Preuve pour vérifier le ciphertext
    function castVote(
        uint256 electionId,
        externalEuint32 encryptedOption,
        bytes calldata inputProof
    ) external {
        Election storage election = elections[electionId];
        require(election.id != 0, "Election does not exist");
        require(election.isActive, "Election is not active");
        require(!hasVoted[electionId][msg.sender], "Already voted");

        euint32 voteValue = FHE.fromExternal(encryptedOption, inputProof);

        for (uint256 i = 0; i < election.optionCount; i++) {
            euint32 optionIndex = FHE.asEuint32(uint32(i));
            ebool isThisOption = FHE.eq(voteValue, optionIndex);
            euint32 increment = FHE.select(isThisOption, FHE.asEuint32(1), FHE.asEuint32(0));
            euint32 newTally = FHE.add(encryptedTallies[electionId][i], increment);
            FHE.allowThis(newTally);
            encryptedTallies[electionId][i] = newTally;
        }

        hasVoted[electionId][msg.sender] = true;
        election.voterCount++;

        emit VoteCast(electionId, msg.sender);
    }

    /// @notice Ferme une election et rend les resultats déchiffrables publiquement
    /// @param electionId ID de l'election à fermer
    function closeElection(uint256 electionId) external {
        Election storage election = elections[electionId];
        require(election.id != 0, "Election does not exist");
        require(election.isActive, "Election already closed");

        election.isActive = false;

        for (uint256 i = 0; i < election.optionCount; i++) {
            euint32 tally = encryptedTallies[electionId][i];
            FHE.makePubliclyDecryptable(tally);
        }

        emit ElectionClosed(electionId);
    }

    /// @notice Recupere les informations d'une election
    function getElection(uint256 electionId)
        external
        view
        returns (string memory title, string[] memory options, bool isActive, uint256 voterCount)
    {
        Election storage election = elections[electionId];
        require(election.id != 0, "Election does not exist");
        return (election.title, election.options, election.isActive, election.voterCount);
    }

    /// @notice Recupere le total chiffré pour une option
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
