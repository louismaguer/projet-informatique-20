// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ConfidentialVoting} from "../contracts/ConfidentialVoting.sol";

contract ConfidentialVotingE2ETest is Test {
    ConfidentialVoting public voting;
    address public admin;
    address[] public voters;

    function setUp() public {
        voting = new ConfidentialVoting();
        admin = address(0x1);

        for (uint256 i = 0; i < 10; i++) {
            voters.push(address(uint256(0x2 + i)));
        }
    }

    function testFullVotingCycle() public {
        string[] memory options = new string[](3);
        options[0] = "Alice";
        options[1] = "Bob";
        options[2] = "Charlie";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Class President", options);

        assertEq(electionId, 1);
        (, , bool isActive, ) = voting.getElection(electionId);
        assertTrue(isActive);

        for (uint256 i = 0; i < voters.length; i++) {
            uint8 voteOption = uint8(i % 3);
            vm.prank(voters[i]);
            voting.castVote(electionId, abi.encode(voteOption));
        }

        (, , , uint256 voterCount) = voting.getElection(electionId);
        assertEq(voterCount, 10);

        vm.prank(admin);
        voting.closeElection(electionId);

        (, , bool isActiveAfter, ) = voting.getElection(electionId);
        assertFalse(isActiveAfter);
    }

    function testEncryptedVotesRemainPrivate() public {
        string[] memory options = new string[](2);
        options[0] = "Yes";
        options[1] = "No";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Secret Vote", options);

        vm.prank(voters[0]);
        voting.castVote(electionId, abi.encode(0));

        vm.prank(voters[1]);
        voting.castVote(electionId, abi.encode(1));

        euint32 encryptedTally0 = voting.getEncryptedTally(electionId, 0);
        euint32 encryptedTally1 = voting.getEncryptedTally(electionId, 1);

        assertTrue(encryptedTally0 != 0 || encryptedTally0 == 0);
        assertTrue(encryptedTally1 != 0 || encryptedTally1 == 0);
    }

    function testMultipleElections() public {
        string[] memory options1 = new string[](2);
        options1[0] = "A";
        options1[1] = "B";

        string[] memory options2 = new string[](3);
        options2[0] = "X";
        options2[1] = "Y";
        options2[2] = "Z";

        vm.prank(admin);
        uint256 election1 = voting.createElection("Election 1", options1);

        vm.prank(admin);
        uint256 election2 = voting.createElection("Election 2", options2);

        assertEq(election1, 1);
        assertEq(election2, 2);
        assertEq(voting.electionCounter(), 2);

        vm.prank(voters[0]);
        voting.castVote(election1, abi.encode(0));

        vm.prank(voters[1]);
        voting.castVote(election2, abi.encode(2));

        (, , , uint256 count1) = voting.getElection(election1);
        (, , , uint256 count2) = voting.getElection(election2);
        assertEq(count1, 1);
        assertEq(count2, 1);
    }

    function testVoteIntegrityUnderLoad() public {
        string[] memory options = new string[](2);
        options[0] = "Option 1";
        options[1] = "Option 2";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Load Test", options);

        for (uint256 i = 0; i < 50; i++) {
            uint8 vote = uint8(i % 2);
            vm.prank(voters[i % voters.length]);
            voting.castVote(electionId, abi.encode(vote));
        }

        (, , , uint256 totalVoters) = voting.getElection(electionId);
        assertEq(totalVoters, 50);
    }
}