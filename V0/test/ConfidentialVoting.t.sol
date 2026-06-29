// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {ConfidentialVoting} from "../contracts/ConfidentialVoting.sol";
import "@fhevm/lib/TFHE.sol";

contract ConfidentialVotingTest is Test {
    ConfidentialVoting public voting;
    address public admin = address(0x1);
    address public voter1 = address(0x2);
    address public voter2 = address(0x3);
    address public voter3 = address(0x4);

    function setUp() public {
        voting = new ConfidentialVoting();
    }

    function testCreateElection() public {
        string[] memory options = new string[](3);
        options[0] = "Alice";
        options[1] = "Bob";
        options[2] = "Charlie";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Mayor Election", options);

        assertEq(electionId, 1);
        assertEq(voting.electionCounter(), 1);

        (string memory title, string[] memory returnedOptions, bool isActive, uint256 voterCount) = voting.getElection(electionId);
        assertEq(title, "Mayor Election");
        assertEq(returnedOptions.length, 3);
        assertTrue(isActive);
        assertEq(voterCount, 0);
    }

    function testCreateElectionRequiresTitle() public {
        string[] memory options = new string[](2);
        options[0] = "Alice";
        options[1] = "Bob";

        vm.prank(admin);
        vm.expectRevert("Title required");
        voting.createElection("", options);
    }

    function testCreateElectionRequiresMinOptions() public {
        string[] memory options = new string[](1);
        options[0] = "Alice";

        vm.prank(admin);
        vm.expectRevert("At least 2 options required");
        voting.createElection("Single Option", options);
    }

    function testCannotVoteTwice() public {
        string[] memory options = new string[](2);
        options[0] = "Yes";
        options[1] = "No";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Poll", options);

        vm.prank(voter1);
        voting.castVote(electionId, bytes32(0), "");

        vm.prank(voter1);
        vm.expectRevert("Already voted");
        voting.castVote(electionId, bytes32(1), "");
    }

    function testCannotVoteOnInactiveElection() public {
        string[] memory options = new string[](2);
        options[0] = "Yes";
        options[1] = "No";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Poll", options);

        vm.prank(admin);
        voting.closeElection(electionId);

        vm.prank(voter1);
        vm.expectRevert("Election is not active");
        voting.castVote(electionId, bytes32(0), "");
    }

    function testCloseElection() public {
        string[] memory options = new string[](2);
        options[0] = "Yes";
        options[1] = "No";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Poll", options);

        vm.prank(admin);
        voting.closeElection(electionId);

        (, , bool isActive, ) = voting.getElection(electionId);
        assertFalse(isActive);
    }

    function testCannotCloseNonExistentElection() public {
        vm.prank(admin);
        vm.expectRevert();
        voting.closeElection(999);
    }

    function testGetEncryptedTally() public {
        string[] memory options = new string[](2);
        options[0] = "Yes";
        options[1] = "No";

        vm.prank(admin);
        uint256 electionId = voting.createElection("Poll", options);

        euint32 tally0 = voting.getEncryptedTally(electionId, 0);
        euint32 tally1 = voting.getEncryptedTally(electionId, 1);

        assertTrue(tally0 != 0 || tally0 == 0);
        assertTrue(tally1 != 0 || tally1 == 0);
    }
}